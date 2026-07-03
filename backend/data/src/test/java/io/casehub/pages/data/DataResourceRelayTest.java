package io.casehub.pages.data;

import io.quarkus.test.junit.QuarkusTest;
import io.restassured.http.ContentType;
import io.smallrye.jwt.build.Jwt;
import org.junit.jupiter.api.Test;

import java.util.Map;
import java.util.Set;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.equalTo;

@QuarkusTest
class DataResourceRelayTest {

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
    void fetch_without_jwt_returns_401() {
        given()
                .contentType(ContentType.JSON)
                .body(new DataRequest("https://example.com/data", "GET", null, null, null, null))
                .when()
                .post("/api/dataset/fetch")
                .then()
                .statusCode(401);
    }

    @Test
    void fetch_missing_tenant_claim_returns_401() {
        given()
                .auth().oauth2(createTokenWithoutTenant())
                .contentType(ContentType.JSON)
                .body(new DataRequest("https://example.com/data", "GET", null, null, null, null))
                .when()
                .post("/api/dataset/fetch")
                .then()
                .statusCode(401)
                .body("error", equalTo("Missing claim: tenant_id"));
    }

    @Test
    void fetch_non_http_url_returns_400() {
        given()
                .auth().oauth2(createValidToken())
                .contentType(ContentType.JSON)
                .body(new DataRequest("file:///etc/passwd", "GET", null, null, null, null))
                .when()
                .post("/api/dataset/fetch")
                .then()
                .statusCode(400);
    }

    @Test
    void fetch_loopback_address_returns_403() {
        given()
                .auth().oauth2(createValidToken())
                .contentType(ContentType.JSON)
                .body(new DataRequest("http://127.0.0.1/test", "GET", null, null, null, null))
                .when()
                .post("/api/dataset/fetch")
                .then()
                .statusCode(403);
    }

    @Test
    void fetch_ftp_scheme_returns_400() {
        given()
                .auth().oauth2(createValidToken())
                .contentType(ContentType.JSON)
                .body(new DataRequest("ftp://example.com/data", "GET", null, null, null, null))
                .when()
                .post("/api/dataset/fetch")
                .then()
                .statusCode(400);
    }

    @Test
    void fetch_localhost_returns_403() {
        given()
                .auth().oauth2(createValidToken())
                .contentType(ContentType.JSON)
                .body(new DataRequest("http://localhost/test", "GET", null, null, null, null))
                .when()
                .post("/api/dataset/fetch")
                .then()
                .statusCode(403);
    }
}
