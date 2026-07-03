package io.casehub.pages.data;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PostConstruct;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.ws.rs.WebApplicationException;
import jakarta.ws.rs.core.Response;
import org.eclipse.microprofile.config.inject.ConfigProperty;

import java.net.InetAddress;
import java.net.URI;
import java.net.URLEncoder;
import java.net.UnknownHostException;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

@ApplicationScoped
public class RelayClient {

    private HttpClient httpClient;

    @ConfigProperty(name = "casehub.pages.data.relay.connect-timeout-ms", defaultValue = "5000")
    int connectTimeoutMs;

    @ConfigProperty(name = "casehub.pages.data.relay.read-timeout-ms", defaultValue = "30000")
    int readTimeoutMs;

    @ConfigProperty(name = "casehub.pages.data.relay.allowed-hosts")
    Optional<List<String>> allowedHosts;

    @PostConstruct
    void init() {
        httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofMillis(connectTimeoutMs))
            .followRedirects(HttpClient.Redirect.NEVER)
            .build();
    }

    public void validateTarget(String urlString) {
        URI uri;
        try {
            uri = URI.create(urlString);
        } catch (IllegalArgumentException e) {
            throw new WebApplicationException("Invalid URL", Response.Status.BAD_REQUEST);
        }

        String scheme = uri.getScheme();
        if (scheme == null || (!scheme.equals("http") && !scheme.equals("https"))) {
            throw new WebApplicationException("Only http/https URLs allowed", Response.Status.BAD_REQUEST);
        }

        if (allowedHosts.isPresent() && !allowedHosts.get().contains(uri.getHost())) {
            throw new WebApplicationException("Host not in allowlist: " + uri.getHost(), Response.Status.FORBIDDEN);
        }

        try {
            InetAddress addr = InetAddress.getByName(uri.getHost());
            if (addr.isLoopbackAddress() || addr.isSiteLocalAddress() || addr.isLinkLocalAddress()) {
                throw new WebApplicationException("Cannot relay to private/loopback addresses", Response.Status.FORBIDDEN);
            }
        } catch (UnknownHostException e) {
            throw new WebApplicationException("Cannot resolve host: " + uri.getHost(), Response.Status.BAD_REQUEST);
        }
    }

    public FetchResult fetch(DataRequest request) {
        URI baseUri = URI.create(request.url());
        String fullUrl = request.url();
        if (request.query() != null && !request.query().isEmpty()) {
            String queryString = request.query().entrySet().stream()
                .map(e -> URLEncoder.encode(e.getKey(), StandardCharsets.UTF_8) + "=" + URLEncoder.encode(e.getValue(), StandardCharsets.UTF_8))
                .collect(Collectors.joining("&"));
            fullUrl += (baseUri.getQuery() == null ? "?" : "&") + queryString;
        }

        HttpRequest.Builder builder = HttpRequest.newBuilder()
            .uri(URI.create(fullUrl))
            .timeout(Duration.ofMillis(readTimeoutMs));

        if (request.headers() != null) {
            request.headers().forEach(builder::header);
        }

        String method = request.method() != null ? request.method().toUpperCase() : "GET";
        HttpRequest.BodyPublisher bodyPublisher;
        if (request.form() != null && !request.form().isEmpty()) {
            String formBody = request.form().entrySet().stream()
                .map(e -> URLEncoder.encode(e.getKey(), StandardCharsets.UTF_8) + "=" + URLEncoder.encode(e.getValue(), StandardCharsets.UTF_8))
                .collect(Collectors.joining("&"));
            bodyPublisher = HttpRequest.BodyPublishers.ofString(formBody);
            builder.header("Content-Type", "application/x-www-form-urlencoded");
        } else if (request.body() != null) {
            bodyPublisher = HttpRequest.BodyPublishers.ofString(request.body());
        } else {
            bodyPublisher = HttpRequest.BodyPublishers.noBody();
        }

        builder.method(method, bodyPublisher);

        try {
            HttpResponse<String> response = httpClient.send(builder.build(), HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() >= 400) {
                throw new WebApplicationException(
                    "Upstream fetch failed",
                    Response.status(502).entity(Map.of("error", "Upstream fetch failed", "status", response.statusCode())).build());
            }
            String contentType = response.headers().firstValue("content-type").orElse(null);
            Object data;
            if (contentType != null && contentType.contains("json")) {
                data = new ObjectMapper().readValue(response.body(), Object.class);
            } else {
                data = response.body();
            }
            return new FetchResult(data, contentType);
        } catch (WebApplicationException e) {
            throw e;
        } catch (Exception e) {
            throw new WebApplicationException("Relay fetch failed: " + e.getMessage(), Response.Status.BAD_GATEWAY);
        }
    }
}
