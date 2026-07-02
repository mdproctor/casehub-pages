package io.casehub.pages.auth;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.quarkus.test.junit.QuarkusTest;
import io.restassured.http.ContentType;
import org.junit.jupiter.api.Test;

import java.util.Base64;
import java.util.List;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.*;

@QuarkusTest
class DevAuthResourceTest {

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    void testLoginWithNameAndRolesReturnsTokenWithCorrectClaims() throws Exception {
        String tokenJson = given()
            .contentType(ContentType.JSON)
            .body(new LoginRequest("alice", List.of("user", "admin")))
            .when()
            .post("/dev/auth/login")
            .then()
            .statusCode(200)
            .body("token", notNullValue())
            .extract()
            .asString();

        // Token should be a non-empty string
        String token = io.restassured.path.json.JsonPath.from(tokenJson).getString("token");
        org.assertj.core.api.Assertions.assertThat(token).isNotBlank();

        // Decode JWT payload (without signature verification — dev/test only)
        String[] parts = token.split("\\.");
        org.assertj.core.api.Assertions.assertThat(parts).hasSize(3);
        String payloadJson = new String(Base64.getUrlDecoder().decode(parts[1]));
        JsonNode claims = objectMapper.readTree(payloadJson);

        org.assertj.core.api.Assertions.assertThat(claims.get("sub").asText()).isEqualTo("alice");
        org.assertj.core.api.Assertions.assertThat(claims.get("iss").asText()).isEqualTo("casehub-dev");
        org.assertj.core.api.Assertions.assertThat(claims.get("tenant_id").asText()).isEqualTo("dev");

        List<String> groups = objectMapper.convertValue(claims.get("groups"), List.class);
        org.assertj.core.api.Assertions.assertThat(groups).containsExactlyInAnyOrder("user", "admin");

        // Verify expiration is ~24 hours from now (allow ±1 hour tolerance)
        long now = System.currentTimeMillis() / 1000;
        long exp = claims.get("exp").asLong();
        long diff = exp - now;
        org.assertj.core.api.Assertions.assertThat(diff)
            .isBetween(23 * 60 * 60L, 25 * 60 * 60L);
    }

    @Test
    void testLoginWithNameOnlyDefaultsRolesToUser() throws Exception {
        String tokenJson = given()
            .contentType(ContentType.JSON)
            .body(new LoginRequest("bob", null))
            .when()
            .post("/dev/auth/login")
            .then()
            .statusCode(200)
            .body("token", notNullValue())
            .extract()
            .asString();

        String token = io.restassured.path.json.JsonPath.from(tokenJson).getString("token");
        String[] parts = token.split("\\.");
        String payloadJson = new String(Base64.getUrlDecoder().decode(parts[1]));
        JsonNode claims = objectMapper.readTree(payloadJson);

        List<String> groups = objectMapper.convertValue(claims.get("groups"), List.class);
        org.assertj.core.api.Assertions.assertThat(groups).containsExactly("user");
    }

    @Test
    void testLoginWithoutNameReturns400() {
        given()
            .contentType(ContentType.JSON)
            .body(new LoginRequest(null, List.of("user")))
            .when()
            .post("/dev/auth/login")
            .then()
            .statusCode(400)
            .body("error", equalTo("name is required"));
    }

    @Test
    void testLoginWithBlankNameReturns400() {
        given()
            .contentType(ContentType.JSON)
            .body(new LoginRequest("  ", List.of("user")))
            .when()
            .post("/dev/auth/login")
            .then()
            .statusCode(400)
            .body("error", equalTo("name is required"));
    }

    @Test
    void testTokenWorksOnAuthenticatedEndpoint() {
        // Get token
        String tokenJson = given()
            .contentType(ContentType.JSON)
            .body(new LoginRequest("charlie", List.of("tester")))
            .when()
            .post("/dev/auth/login")
            .then()
            .statusCode(200)
            .extract()
            .asString();

        String token = io.restassured.path.json.JsonPath.from(tokenJson).getString("token");

        // Use token on protected endpoint
        given()
            .auth().oauth2(token)
            .when()
            .get("/test/protected")
            .then()
            .statusCode(200)
            .body("sub", equalTo("charlie"))
            .body("groups", hasItems("tester"));
    }
}
