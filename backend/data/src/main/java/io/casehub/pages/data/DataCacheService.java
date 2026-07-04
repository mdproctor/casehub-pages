package io.casehub.pages.data;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import com.github.benmanes.caffeine.cache.Expiry;
import jakarta.annotation.PostConstruct;
import jakarta.enterprise.context.ApplicationScoped;
import org.eclipse.microprofile.config.inject.ConfigProperty;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Map;
import java.util.TreeMap;
import java.util.concurrent.TimeUnit;
import java.util.function.Supplier;

@ApplicationScoped
public class DataCacheService {

    @ConfigProperty(name = "casehub.pages.data.cache.enabled", defaultValue = "true")
    boolean enabled;

    @ConfigProperty(name = "casehub.pages.data.cache.maximum-size", defaultValue = "500")
    int maximumSize;

    @ConfigProperty(name = "casehub.pages.data.cache.default-ttl-seconds", defaultValue = "60")
    long defaultTtlSeconds;

    @ConfigProperty(name = "casehub.pages.data.cache.relay-default-ttl-seconds", defaultValue = "60")
    long relayDefaultTtlSeconds;

    @ConfigProperty(name = "casehub.pages.data.cache.query-default-ttl-seconds", defaultValue = "60")
    long queryDefaultTtlSeconds;

    private Cache<CacheKey, CacheEntry> cache;

    record CacheKey(String tenantId, String type, String hash) {}

    record CacheEntry(Object value, long ttlNanos) {}

    @PostConstruct
    void init() {
        if (!enabled) {
            cache = null;
            return;
        }
        cache = Caffeine.newBuilder()
            .maximumSize(maximumSize)
            .expireAfter(new Expiry<CacheKey, CacheEntry>() {
                @Override
                public long expireAfterCreate(CacheKey key, CacheEntry entry, long currentTime) {
                    return entry.ttlNanos();
                }

                @Override
                public long expireAfterUpdate(CacheKey key, CacheEntry entry, long currentTime, long currentDuration) {
                    return entry.ttlNanos();
                }

                @Override
                public long expireAfterRead(CacheKey key, CacheEntry entry, long currentTime, long currentDuration) {
                    return currentDuration;
                }
            })
            .recordStats()
            .build();
    }

    public FetchResult fetchCached(String tenantId, DataRequest request, Supplier<FetchResult> loader) {
        if (cache == null) {
            return loader.get();
        }
        long ttl = resolveTtl("relay", request.refreshTimeSeconds(), relayDefaultTtlSeconds);
        var key = new CacheKey(tenantId, "relay", hashRelay(request));
        var entry = cache.get(key, k -> new CacheEntry(loader.get(), ttl));
        return (FetchResult) entry.value();
    }

    public DataSetResult queryCached(String tenantId, DataSetLookup lookup, Supplier<DataSetResult> loader) {
        if (cache == null) {
            return loader.get();
        }
        long ttl = resolveTtl("query", lookup.refreshTimeSeconds(), queryDefaultTtlSeconds);
        var key = new CacheKey(tenantId, "query", hashQuery(lookup));
        var entry = cache.get(key, k -> new CacheEntry(loader.get(), ttl));
        return (DataSetResult) entry.value();
    }

    public void invalidate(String tenantId, String dataSetId) {
        if (cache == null) return;
        String prefix = dataSetId.length() + ":" + dataSetId + "|";
        cache.asMap().keySet().removeIf(k ->
            k.tenantId().equals(tenantId) && k.type().equals("query") && k.hash().startsWith(prefix));
    }

    public void invalidateAll(String tenantId) {
        if (cache == null) return;
        cache.asMap().keySet().removeIf(k -> k.tenantId().equals(tenantId));
    }

    private long resolveTtl(String type, Integer hintSeconds, long typeDefaultSeconds) {
        long seconds = (hintSeconds != null && hintSeconds > 0) ? hintSeconds : typeDefaultSeconds;
        if (seconds <= 0) seconds = defaultTtlSeconds;
        return TimeUnit.SECONDS.toNanos(seconds);
    }

    private String hashRelay(DataRequest r) {
        return sha256(
            (r.url() != null ? r.url() : "") + "|" +
            (r.method() != null ? r.method() : "GET") + "|" +
            sorted(r.headers()) + "|" +
            sorted(r.query()) + "|" +
            sorted(r.form()) + "|" +
            (r.body() != null ? r.body() : "")
        );
    }

    private String hashQuery(DataSetLookup l) {
        String id = l.dataSetId();
        return id.length() + ":" + id + "|" + sha256(
            id + "|" + (l.operations() != null ? l.operations().toString() : "")
        );
    }

    private static String sorted(Map<String, String> map) {
        if (map == null || map.isEmpty()) return "";
        return new TreeMap<>(map).toString();
    }

    private static String sha256(String input) {
        try {
            var digest = MessageDigest.getInstance("SHA-256");
            var hash = digest.digest(input.getBytes(StandardCharsets.UTF_8));
            var sb = new StringBuilder();
            for (byte b : hash) {
                sb.append(String.format("%02x", b));
            }
            return sb.toString();
        } catch (NoSuchAlgorithmException e) {
            throw new RuntimeException(e);
        }
    }
}
