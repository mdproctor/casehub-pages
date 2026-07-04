package io.casehub.pages.data;

import io.quarkus.security.Authenticated;
import jakarta.annotation.security.PermitAll;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.inject.Any;
import jakarta.enterprise.inject.Instance;
import jakarta.inject.Inject;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.DELETE;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.eclipse.microprofile.jwt.JsonWebToken;

import java.util.List;
import java.util.Map;

@Path("/api/dataset")
@Authenticated
@ApplicationScoped
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
public class DataResource {

    @Inject
    JsonWebToken jwt;

    @ConfigProperty(name = "casehub.pages.data.tenant-claim", defaultValue = "tenant_id")
    String tenantClaim;

    @Inject
    RelayClient relayClient;

    @Inject
    @Any
    Instance<DataProvider> providers;

    @Inject
    DataCacheService cacheService;

    @POST
    @Path("/fetch")
    public Response fetch(DataRequest request) {
        String tenantId = extractTenant();
        if (tenantId == null) {
            return missingTenantResponse();
        }

        FetchResult result = cacheService.fetchCached(tenantId, request, () -> {
            relayClient.validateTarget(request.url());
            return relayClient.fetch(request);
        });
        return Response.ok(result).build();
    }

    @POST
    @Path("/query")
    public Response query(DataSetLookup lookup) {
        String tenantId = extractTenant();
        if (tenantId == null) {
            return missingTenantResponse();
        }

        DataProvider provider = resolveProvider(lookup.dataSetId());
        if (provider == null) {
            return Response.status(Response.Status.BAD_REQUEST)
                .entity(Map.of("error", "No provider found for dataset: " + lookup.dataSetId()))
                .build();
        }

        DataSetResult result = cacheService.queryCached(tenantId, lookup, () -> provider.query(lookup));
        return Response.ok(result).build();
    }

    @DELETE
    @Path("/cache/{dataSetId}")
    public Response invalidateCache(@PathParam("dataSetId") String dataSetId) {
        String tenantId = extractTenant();
        if (tenantId == null) {
            return missingTenantResponse();
        }
        cacheService.invalidate(tenantId, dataSetId);
        return Response.noContent().build();
    }

    @GET
    @Path("/capabilities")
    @PermitAll
    public ServiceCapabilities capabilities() {
        List<String> providerTypes = new java.util.ArrayList<>();
        for (DataProvider p : providers) {
            providerTypes.add(p.type());
        }
        return new ServiceCapabilities(
                !providerTypes.isEmpty(),
                List.copyOf(providerTypes),
                true,
                true);
    }

    private DataProvider resolveProvider(String dataSetId) {
        for (DataProvider p : providers) {
            if (p.canHandle(dataSetId)) {
                return p;
            }
        }
        return null;
    }

    private String extractTenant() {
        Object claim = jwt.getClaim(tenantClaim);
        return claim != null ? claim.toString() : null;
    }

    private Response missingTenantResponse() {
        return Response.status(Response.Status.UNAUTHORIZED)
            .entity(Map.of("error", "Missing claim: " + tenantClaim))
            .build();
    }
}
