package io.casehub.pages.data;

import io.quarkus.test.junit.QuarkusTest;
import io.restassured.http.ContentType;
import io.smallrye.jwt.build.Jwt;
import jakarta.annotation.Priority;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.inject.Alternative;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Set;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.hasSize;

@QuarkusTest
class DataResourceQueryTest {

    @Alternative
    @Priority(1)
    @ApplicationScoped
    static class TestDataProvider implements DataProvider {
        @Override
        public String type() {
            return "test";
        }

        @Override
        public boolean canHandle(String dataSetId) {
            return "test-dataset".equals(dataSetId);
        }

        @Override
        public DataSetResult query(DataSetLookup lookup) {
            List<ColumnDef> columns = List.of(
                    new ColumnDef("name", "Name", "string"),
                    new ColumnDef("value", "Value", "number")
            );
            List<List<String>> rows = List.of(
                    List.of("alpha", "10"),
                    List.of("beta", "20")
            );
            return new DataSetResult(columns, rows);
        }
    }

    private String createValidToken() {
        return Jwt.claims()
                .subject("alice")
                .claim("tenant_id", "dev")
                .groups(Set.of("user"))
                .sign();
    }

    private String createTokenWithoutTenant() {
        return Jwt.claims()
                .subject("alice")
                .groups(Set.of("user"))
                .sign();
    }

    @Test
    void query_without_jwt_returns_401() {
        given()
                .contentType(ContentType.JSON)
                .body(new DataSetLookup("test-dataset", List.of(), null))
                .when()
                .post("/api/dataset/query")
                .then()
                .statusCode(401);
    }

    @Test
    void query_missing_tenant_claim_returns_401() {
        given()
                .auth().oauth2(createTokenWithoutTenant())
                .contentType(ContentType.JSON)
                .body(new DataSetLookup("test-dataset", List.of(), null))
                .when()
                .post("/api/dataset/query")
                .then()
                .statusCode(401)
                .body("error", equalTo("Missing claim: tenant_id"));
    }

    @Test
    void query_unknown_dataset_returns_400() {
        given()
                .auth().oauth2(createValidToken())
                .contentType(ContentType.JSON)
                .body(new DataSetLookup("unknown-dataset", List.of(), null))
                .when()
                .post("/api/dataset/query")
                .then()
                .statusCode(400)
                .body("error", equalTo("No provider found for dataset: unknown-dataset"));
    }

    @Test
    void query_known_dataset_returns_200_with_data() {
        given()
                .auth().oauth2(createValidToken())
                .contentType(ContentType.JSON)
                .body(new DataSetLookup("test-dataset", List.of(), null))
                .when()
                .post("/api/dataset/query")
                .then()
                .statusCode(200)
                .body("columns", hasSize(2))
                .body("columns[0].id", equalTo("name"))
                .body("columns[0].name", equalTo("Name"))
                .body("columns[0].type", equalTo("string"))
                .body("columns[1].id", equalTo("value"))
                .body("rows", hasSize(2))
                .body("rows[0][0]", equalTo("alpha"))
                .body("rows[0][1]", equalTo("10"));
    }

    @Test
    void capabilities_returns_provider_info_without_auth() {
        given()
                .when()
                .get("/api/dataset/capabilities")
                .then()
                .statusCode(200)
                .body("serverSideQuery", equalTo(true))
                .body("dataProviders", hasItem("test"))
                .body("dataProxy", equalTo(true))
                .body("serverSideCache", equalTo(true));
    }

    @Test
    void capabilities_does_not_require_jwt() {
        given()
                .when()
                .get("/api/dataset/capabilities")
                .then()
                .statusCode(200);
    }
}
