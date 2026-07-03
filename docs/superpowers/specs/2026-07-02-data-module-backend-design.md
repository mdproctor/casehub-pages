# Data Module Backend — Design Plan

## Context

The casehub-pages backend has four Maven modules (`auth`, `layout`, `layout-sqlite`, `data`). The `data` module is currently a scaffold (just `package-info.java`). Issue #21 (Optional Quarkus backend MVP) scoped a data module with: REST API for dataset fetch/query, SQL data provider with push-down filter/group/sort, and multiple named datasources. This plan completes that scope.

The frontend already has a `ServerRelayProvider` that POSTs `DataRequest` to a configurable endpoint and expects `FetchResult` back — so the relay protocol is defined. The `/query` endpoint for SQL push-down is new.

## Module Structure

Two modules, mirroring the `layout` / `layout-sqlite` split:

- **`backend/data/`** — Core: SPI interface, REST resource, relay proxy, DTOs, `@DefaultBean` no-op. No JDBC.
- **`backend/data-sql/`** — SQL provider: Quarkus Agroal named datasources, `SqlQueryBuilder`, `ResultSetMapper`.

## Files to Create

### `backend/data/` (core module)

| File | Purpose |
|------|---------|
| `DataProvider.java` | SPI: `type()`, `canHandle(id)`, `query(lookup)` |
| `NoOpDataProvider.java` | `@DefaultBean @ApplicationScoped` returning empty results |
| `DataResource.java` | REST: `POST /fetch` (relay) + `POST /query` (push-down) |
| `RelayClient.java` | `java.net.http.HttpClient` wrapper with SSRF validation |
| `DataRequest.java` | Record: url, method, headers, query, form, body |
| `FetchResult.java` | Record: data (Object), contentType |
| `DataSetLookup.java` | Record: dataSetId, operations list |
| `DataSetOp.java` | Sealed interface with Jackson `@JsonTypeInfo` |
| `FilterOp.java` | Record: expressions (tree with and/or/not + leaves) |
| `FilterExpression.java` | Sealed interface for filter expression tree |
| `GroupOp.java` | Record: groupingKey, columns, selectedIntervals |
| `SortOp.java` | Record: columns list |
| `ColumnDef.java` | Record: id, name, type |
| `DataSetResult.java` | Record: columns, rows (List<List<String>>) |
| `pom.xml` | quarkus-rest-jackson, quarkus-smallrye-jwt, quarkus-arc |

### `backend/data-sql/` (SQL provider)

| File | Purpose |
|------|---------|
| `SqlDataProvider.java` | `@ApplicationScoped DataProvider` — resolves datasource, delegates to builder |
| `SqlQueryBuilder.java` | Builds parameterized SQL from base query + operations |
| `PreparedQuery.java` | Record: sql string, bind params list |
| `ResultSetMapper.java` | JDBC `ResultSet` → `DataSetResult` |
| `pom.xml` | depends on data module + quarkus-agroal |

### Tests

| File | Type |
|------|------|
| `NoOpDataProviderTest.java` | Unit — returns empty |
| `DataResourceRelayTest.java` | `@QuarkusTest` — relay proxy with mock upstream |
| `DataResourceQueryTest.java` | `@QuarkusTest` — query with mock provider |
| `SqlQueryBuilderTest.java` | Plain JUnit 5 — SQL generation + injection prevention |
| `ResultSetMapperTest.java` | Plain JUnit 5 — type mapping |
| `SqlDataProviderTest.java` | `@QuarkusTest` — end-to-end with H2 in-memory |

## Key Design Decisions

### Base query configuration (not user-supplied SQL)

```properties
casehub.pages.data.sql.queries.sales-summary.datasource=sales
casehub.pages.data.sql.queries.sales-summary.query=SELECT * FROM sales_data
```

Frontend sends `dataSetId: "sales-summary"`. Backend resolves to named datasource + base query. Operations appended as `SELECT ... FROM (<base>) AS _ds WHERE ... GROUP BY ... ORDER BY ...`.

### SSRF protection for relay proxy

- Scheme: only http/https
- Optional host allowlist: `casehub.pages.data.relay.allowed-hosts`
- Private IP block: reject loopback/site-local/link-local addresses
- Response size limit: configurable max bytes (default 10MB)

### SQL injection prevention

1. Filter values → PreparedStatement bind parameters
2. Column IDs → validated against allowlist from base query metadata
3. Column names → ANSI-quoted in generated SQL

### Filter expression tree → SQL WHERE

Frontend sends `FilterExprTree<Leaf>` which is a recursive AND/OR/NOT tree with typed leaves (numeric, string, date, unresolved). The SQL builder walks the tree recursively:
- `and` → `(child1 AND child2 AND ...)`
- `or` → `(child1 OR child2 OR ...)`
- `not` → `NOT (child)`
- Leaf → `"column" <op> ?` with bind parameter

### Aggregation → SQL

| Frontend | SQL |
|----------|-----|
| COUNT | `COUNT("col")` |
| DISTINCT | `COUNT(DISTINCT "col")` |
| SUM | `SUM("col")` |
| AVERAGE | `AVG("col")` |
| MIN | `MIN("col")` |
| MAX | `MAX("col")` |
| JOIN | `STRING_AGG("col", ?)` |
| DISTINCTJOIN | `STRING_AGG(DISTINCT "col", ?)` |
| MEDIAN | Unsupported in SQL — returns error |

### No frontend changes

The relay endpoint matches the existing `ServerRelayProvider` protocol. The `/query` endpoint is backend-only. Frontend integration for SQL push-down is a follow-up issue.

## Verification

1. `mvn -f backend/data/pom.xml test` — relay and query endpoint tests
2. `mvn -f backend/data-sql/pom.xml test` — SQL builder unit tests + H2 integration
3. `mvn -f backend/pom.xml test` — all backend tests pass
4. Manual: start Quarkus dev mode, POST to `/api/dataset/fetch` with a public URL, verify relay returns data
5. Manual: configure an H2 datasource + registered query, POST to `/api/dataset/query` with filter/sort operations
