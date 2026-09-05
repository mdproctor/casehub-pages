package io.casehub.pages.scenario.runtime;

import io.casehub.pages.scenario.ScriptDescriptor;
import io.casehub.pages.scenario.ScriptMeta;
import jakarta.inject.Inject;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.DELETE;
import jakarta.ws.rs.ForbiddenException;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.NotFoundException;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.PUT;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

import java.util.List;

@Path("/scenario/library")
public class ScenarioLibraryResource {

    @Inject
    ScriptRegistry registry;

    @GET
    @Produces(MediaType.APPLICATION_JSON)
    public List<ScriptDescriptor> list(@QueryParam("labels") List<String> labels,
                                        @QueryParam("tags") List<String> tags) {
        return registry.list(labels, tags);
    }

    @GET
    @Path("/{name}")
    @Produces(MediaType.APPLICATION_JSON)
    public ScriptDescriptor get(@PathParam("name") String name) {
        return registry.get(name)
                .orElseThrow(() -> new NotFoundException("Script not found: " + name));
    }

    @GET
    @Path("/{name}/yaml")
    @Produces("text/yaml")
    public String getYaml(@PathParam("name") String name) {
        return registry.getYaml(name)
                .orElseThrow(() -> new NotFoundException("Script not found: " + name));
    }

    @POST
    @Consumes("text/yaml")
    @Produces(MediaType.APPLICATION_JSON)
    public Response upload(String yaml) {
        var desc = registry.upload(yaml);
        return Response.status(Response.Status.CREATED).entity(desc).build();
    }

    @PUT
    @Path("/{name}/meta")
    @Produces(MediaType.APPLICATION_JSON)
    public ScriptDescriptor updateMeta(@PathParam("name") String name, ScriptMeta meta) {
        return registry.updateMeta(name, meta);
    }

    @DELETE
    @Path("/{name}")
    public Response delete(@PathParam("name") String name) {
        if (registry.get(name).isEmpty()) {
            throw new NotFoundException("Script not found: " + name);
        }
        if (!registry.delete(name)) {
            throw new ForbiddenException("Cannot delete bundled or external script: " + name);
        }
        return Response.noContent().build();
    }

}
