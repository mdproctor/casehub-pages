package io.casehub.pages.data.sql;

import io.agroal.api.AgroalDataSource;
import io.casehub.pages.data.DataProvider;
import io.casehub.pages.data.DataSetLookup;
import io.casehub.pages.data.DataSetResult;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import org.eclipse.microprofile.config.ConfigProvider;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.HashMap;
import java.util.Map;
import java.util.Set;

@ApplicationScoped
public class SqlDataProvider implements DataProvider {

    @Inject
    AgroalDataSource defaultDataSource;

    private Map<String, QueryConfig> queryConfigs;

    record QueryConfig(String datasource, String query) {}

    void loadConfigs() {
        if (queryConfigs != null) return;
        queryConfigs = new HashMap<>();
        var config = ConfigProvider.getConfig();
        for (String prop : config.getPropertyNames()) {
            if (prop.startsWith("casehub.pages.data.sql.queries.") && prop.endsWith(".query")) {
                String name = prop.substring("casehub.pages.data.sql.queries.".length(), prop.length() - ".query".length());
                String query = config.getValue(prop, String.class);
                String dsName = config.getOptionalValue("casehub.pages.data.sql.queries." + name + ".datasource", String.class).orElse(null);
                queryConfigs.put(name, new QueryConfig(dsName, query));
            }
        }
    }

    @Override
    public String type() {
        return "sql";
    }

    @Override
    public boolean canHandle(String dataSetId) {
        loadConfigs();
        return queryConfigs.containsKey(dataSetId);
    }

    @Override
    public DataSetResult query(DataSetLookup lookup) {
        loadConfigs();
        QueryConfig qc = queryConfigs.get(lookup.dataSetId());
        if (qc == null) {
            throw new IllegalArgumentException("No SQL query configured for dataset: " + lookup.dataSetId());
        }

        // For MVP, always use default datasource
        AgroalDataSource ds = defaultDataSource;

        try (Connection conn = ds.getConnection()) {
            Set<String> allowedColumns = discoverColumns(conn, qc.query());
            PreparedQuery pq = SqlQueryBuilder.build(qc.query(), lookup.operations(), allowedColumns);

            try (PreparedStatement stmt = conn.prepareStatement(pq.sql())) {
                for (int i = 0; i < pq.params().size(); i++) {
                    stmt.setObject(i + 1, pq.params().get(i));
                }
                try (ResultSet rs = stmt.executeQuery()) {
                    return ResultSetMapper.toDataSetResult(rs);
                }
            }
        } catch (SQLException e) {
            throw new IllegalStateException("SQL query failed for dataset '" + lookup.dataSetId() + "': " + e.getMessage(), e);
        }
    }

    private Set<String> discoverColumns(Connection conn, String baseQuery) throws SQLException {
        String metaQuery = "SELECT * FROM (" + baseQuery + ") AS _ds WHERE 1=0";
        try (PreparedStatement stmt = conn.prepareStatement(metaQuery);
             ResultSet rs = stmt.executeQuery()) {
            return ResultSetMapper.extractColumnNames(rs);
        }
    }
}
