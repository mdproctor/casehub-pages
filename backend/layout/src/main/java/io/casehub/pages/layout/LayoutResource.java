package io.casehub.pages.layout;

import io.quarkus.security.Authenticated;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.eclipse.microprofile.jwt.JsonWebToken;

import java.util.Optional;

/**
 * REST resource for layout persistence operations.
 * <p>
 * All endpoints require JWT authentication. Tenant and user identifiers are extracted
 * from the JWT claims.
 */
@Path("/api/layouts")
@Authenticated
@ApplicationScoped
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.TEXT_PLAIN)
public class LayoutResource {

    @Inject
    LayoutPersistenceStore store;

    @Inject
    JsonWebToken jwt;

    @ConfigProperty(name = "casehub.pages.layout.tenant-claim", defaultValue = "tenant_id")
    String tenantClaim;

    /**
     * Load a layout by key.
     *
     * @param key the layout key
     * @return 200 with payload string if found, 204 No Content if not found, 401 if tenant claim missing
     */
    @GET
    @Path("/{key}")
    public Response load(@PathParam("key") String key) {
        String tenantId = extractTenant();
        if (tenantId == null) {
            return missingTenantResponse();
        }

        Optional<String> payload = store.load(key, tenantId, jwt.getSubject());
        return payload.map(p -> Response.ok(p).build())
                .orElse(Response.noContent().build());
    }

    /**
     * Save a layout by key.
     *
     * @param key     the layout key
     * @param payload the layout payload as raw string
     * @return 204 No Content, 401 if tenant claim missing
     */
    @PUT
    @Path("/{key}")
    public Response save(@PathParam("key") String key, String payload) {
        String tenantId = extractTenant();
        if (tenantId == null) {
            return missingTenantResponse();
        }

        store.save(key, tenantId, jwt.getSubject(), payload);
        return Response.noContent().build();
    }

    /**
     * Delete a layout by key.
     *
     * @param key the layout key
     * @return 204 No Content, 401 if tenant claim missing
     */
    @DELETE
    @Path("/{key}")
    public Response delete(@PathParam("key") String key) {
        String tenantId = extractTenant();
        if (tenantId == null) {
            return missingTenantResponse();
        }

        store.delete(key, tenantId, jwt.getSubject());
        return Response.noContent().build();
    }

    private String extractTenant() {
        Object claim = jwt.getClaim(tenantClaim);
        return claim != null ? claim.toString() : null;
    }

    private Response missingTenantResponse() {
        return Response.status(Response.Status.UNAUTHORIZED)
                .entity("{\"error\":\"Missing claim: " + tenantClaim + "\"}")
                .build();
    }
}
