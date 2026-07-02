package io.casehub.pages.auth;

import io.quarkus.arc.profile.UnlessBuildProfile;
import io.quarkus.security.Authenticated;
import jakarta.inject.Inject;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import org.eclipse.microprofile.jwt.JsonWebToken;

import java.util.Map;
import java.util.Set;

@UnlessBuildProfile("prod")
@Path("/test/protected")
@Produces(MediaType.APPLICATION_JSON)
public class ProtectedTestResource {

    @Inject
    JsonWebToken jwt;

    @GET
    @Authenticated
    public Map<String, Object> get() {
        return Map.of(
            "sub", jwt.getSubject(),
            "groups", jwt.getGroups()
        );
    }
}
