package io.casehub.pages.auth;

import io.quarkus.arc.profile.UnlessBuildProfile;
import io.smallrye.jwt.build.Jwt;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import org.eclipse.microprofile.config.inject.ConfigProperty;

import java.time.Duration;
import java.util.HashSet;
import java.util.List;
import java.util.Map;

@Path("/dev/auth")
@UnlessBuildProfile("prod")
@ApplicationScoped
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
public class DevAuthResource {

    @ConfigProperty(name = "casehub.pages.auth.default-tenant", defaultValue = "dev")
    String defaultTenant;

    @POST
    @Path("/login")
    public Response login(LoginRequest request) {
        if (request == null || request.name() == null || request.name().isBlank()) {
            return Response.status(400).entity(Map.of("error", "name is required")).build();
        }
        List<String> roles = request.roles() != null ? request.roles() : List.of("user");
        String token = Jwt.claims()
            .subject(request.name())
            .groups(new HashSet<>(roles))
            .claim("tenant_id", defaultTenant)
            .expiresIn(Duration.ofHours(24))
            .sign();
        return Response.ok(new TokenResponse(token)).build();
    }
}
