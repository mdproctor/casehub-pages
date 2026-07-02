package io.casehub.pages.layout;

import io.quarkus.test.junit.QuarkusTest;
import io.restassured.http.ContentType;
import io.smallrye.jwt.build.Jwt;
import org.junit.jupiter.api.Test;

import java.util.Set;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.equalTo;

@QuarkusTest
class LayoutResourceTest {

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
    void get_with_valid_jwt_returns_204_from_noop_store() {
        given()
                .auth().oauth2(createValidToken())
                .when().get("/api/layouts/test-key")
                .then()
                .statusCode(204);
    }

    @Test
    void put_with_valid_jwt_and_body_returns_204() {
        given()
                .auth().oauth2(createValidToken())
                .contentType(ContentType.TEXT)
                .body("{\"data\":\"test\"}")
                .when().put("/api/layouts/test-key")
                .then()
                .statusCode(204);
    }

    @Test
    void delete_with_valid_jwt_returns_204() {
        given()
                .auth().oauth2(createValidToken())
                .when().delete("/api/layouts/test-key")
                .then()
                .statusCode(204);
    }

    @Test
    void get_without_jwt_returns_401() {
        given()
                .when().get("/api/layouts/test-key")
                .then()
                .statusCode(401);
    }

    @Test
    void put_without_jwt_returns_401() {
        given()
                .contentType(ContentType.TEXT)
                .body("{\"data\":\"test\"}")
                .when().put("/api/layouts/test-key")
                .then()
                .statusCode(401);
    }

    @Test
    void delete_without_jwt_returns_401() {
        given()
                .when().delete("/api/layouts/test-key")
                .then()
                .statusCode(401);
    }

    @Test
    void get_missing_tenant_claim_returns_401_with_descriptive_error() {
        given()
                .auth().oauth2(createTokenWithoutTenant())
                .when().get("/api/layouts/test-key")
                .then()
                .statusCode(401)
                .body("error", equalTo("Missing claim: tenant_id"));
    }

    @Test
    void put_missing_tenant_claim_returns_401_with_descriptive_error() {
        given()
                .auth().oauth2(createTokenWithoutTenant())
                .contentType(ContentType.TEXT)
                .body("{\"data\":\"test\"}")
                .when().put("/api/layouts/test-key")
                .then()
                .statusCode(401)
                .body("error", equalTo("Missing claim: tenant_id"));
    }

    @Test
    void delete_missing_tenant_claim_returns_401_with_descriptive_error() {
        given()
                .auth().oauth2(createTokenWithoutTenant())
                .when().delete("/api/layouts/test-key")
                .then()
                .statusCode(401)
                .body("error", equalTo("Missing claim: tenant_id"));
    }
}
