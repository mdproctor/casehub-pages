package io.casehub.pages.auth;

import io.quarkus.test.junit.QuarkusTest;
import io.quarkus.test.junit.QuarkusTestProfile;
import io.quarkus.test.junit.TestProfile;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static io.restassured.RestAssured.given;

@QuarkusTest
@TestProfile(DevAuthProdProfileExclusionTest.ProdProfile.class)
class DevAuthProdProfileExclusionTest {

    public static class ProdProfile implements QuarkusTestProfile {
        @Override
        public String getConfigProfile() {
            return "prod";
        }

        @Override
        public Map<String, String> getConfigOverrides() {
            return Map.of(
                "mp.jwt.verify.issuer", "casehub-prod",
                "smallrye.jwt.new-token.issuer", "casehub-prod"
            );
        }
    }

    @Test
    void devAuthEndpointNotAvailableInProdProfile() {
        given()
            .contentType("application/json")
            .body("{\"name\": \"alice\"}")
            .when()
            .post("/dev/auth/login")
            .then()
            .statusCode(404);
    }

    @Test
    void protectedTestEndpointNotAvailableInProdProfile() {
        given()
            .when()
            .get("/test/protected")
            .then()
            .statusCode(404);
    }
}
