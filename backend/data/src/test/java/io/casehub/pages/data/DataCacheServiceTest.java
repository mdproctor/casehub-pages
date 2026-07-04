package io.casehub.pages.data;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class DataCacheServiceTest {

    private DataCacheService cache;
    private int fetchCount;
    private int queryCount;

    @BeforeEach
    void setUp() {
        cache = new DataCacheService();
        cache.enabled = true;
        cache.maximumSize = 100;
        cache.defaultTtlSeconds = 60;
        cache.relayDefaultTtlSeconds = 60;
        cache.queryDefaultTtlSeconds = 60;
        cache.init();
        fetchCount = 0;
        queryCount = 0;
    }

    @Test
    void cacheHitReturnsSameResult() {
        var request = new DataRequest("https://api.example.com/data", "GET", Map.of(), Map.of(), null, null, null);
        var expected = new FetchResult("cached-data", "application/json");

        var result1 = cache.fetchCached("tenant-1", request, () -> { fetchCount++; return expected; });
        var result2 = cache.fetchCached("tenant-1", request, () -> { fetchCount++; return new FetchResult("different", null); });

        assertThat(result1.data()).isEqualTo("cached-data");
        assertThat(result2.data()).isEqualTo("cached-data");
        assertThat(fetchCount).isEqualTo(1);
    }

    @Test
    void differentTenantsGetSeparateEntries() {
        var request = new DataRequest("https://api.example.com/data", "GET", Map.of(), Map.of(), null, null, null);

        cache.fetchCached("tenant-1", request, () -> { fetchCount++; return new FetchResult("t1", null); });
        cache.fetchCached("tenant-2", request, () -> { fetchCount++; return new FetchResult("t2", null); });

        assertThat(fetchCount).isEqualTo(2);
    }

    @Test
    void queryCacheHit() {
        var lookup = new DataSetLookup("ds-1", List.of(), null);
        var expected = new DataSetResult(List.of(), List.of());

        var result1 = cache.queryCached("tenant-1", lookup, () -> { queryCount++; return expected; });
        var result2 = cache.queryCached("tenant-1", lookup, () -> { queryCount++; return new DataSetResult(List.of(), List.of()); });

        assertThat(result1).isSameAs(expected);
        assertThat(result2).isSameAs(expected);
        assertThat(queryCount).isEqualTo(1);
    }

    @Test
    void invalidateRemovesQueryEntries() {
        var lookup = new DataSetLookup("ds-1", List.of(), null);
        cache.queryCached("tenant-1", lookup, () -> { queryCount++; return new DataSetResult(List.of(), List.of()); });
        assertThat(queryCount).isEqualTo(1);

        cache.invalidate("tenant-1", "ds-1");

        cache.queryCached("tenant-1", lookup, () -> { queryCount++; return new DataSetResult(List.of(), List.of()); });
        assertThat(queryCount).isEqualTo(2);
    }

    @Test
    void invalidateAllClearsTenantEntries() {
        var request = new DataRequest("https://api.example.com/data", "GET", Map.of(), Map.of(), null, null, null);
        cache.fetchCached("tenant-1", request, () -> { fetchCount++; return new FetchResult("data", null); });

        cache.invalidateAll("tenant-1");

        cache.fetchCached("tenant-1", request, () -> { fetchCount++; return new FetchResult("data2", null); });
        assertThat(fetchCount).isEqualTo(2);
    }

    @Test
    void refreshTimeSecondsHintOverridesTtl() throws InterruptedException {
        var lookup = new DataSetLookup("ds-1", List.of(), 1);
        cache.queryCached("tenant-1", lookup, () -> { queryCount++; return new DataSetResult(List.of(), List.of()); });
        assertThat(queryCount).isEqualTo(1);

        Thread.sleep(1500);

        cache.queryCached("tenant-1", lookup, () -> { queryCount++; return new DataSetResult(List.of(), List.of()); });
        assertThat(queryCount).isEqualTo(2);
    }

    @Test
    void disabledCacheAlwaysMisses() {
        cache.enabled = false;
        cache.init();

        var request = new DataRequest("https://api.example.com/data", "GET", Map.of(), Map.of(), null, null, null);
        cache.fetchCached("tenant-1", request, () -> { fetchCount++; return new FetchResult("data", null); });
        cache.fetchCached("tenant-1", request, () -> { fetchCount++; return new FetchResult("data", null); });

        assertThat(fetchCount).isEqualTo(2);
    }

    @Test
    void invalidateDoesNotAffectOtherTenants() {
        var lookup = new DataSetLookup("ds-1", List.of(), null);
        var result1 = new DataSetResult(List.of(), List.of());
        var result2 = new DataSetResult(List.of(), List.of());

        cache.queryCached("tenant-1", lookup, () -> result1);
        cache.queryCached("tenant-2", lookup, () -> result2);

        cache.invalidate("tenant-1", "ds-1");

        // tenant-2's entry should still be cached (loader not called again)
        var fetched = cache.queryCached("tenant-2", lookup, () -> { queryCount++; return new DataSetResult(List.of(), List.of()); });
        assertThat(fetched).isSameAs(result2);
        assertThat(queryCount).isEqualTo(0);
    }

    @Test
    void differentFormDataGetsSeparateCacheEntries() {
        var request1 = new DataRequest("https://api.example.com/data", "POST",
            Map.of(), Map.of(), Map.of("field", "value1"), null, null);
        var request2 = new DataRequest("https://api.example.com/data", "POST",
            Map.of(), Map.of(), Map.of("field", "value2"), null, null);

        var result1 = cache.fetchCached("tenant-1", request1, () -> { fetchCount++; return new FetchResult("form1", null); });
        var result2 = cache.fetchCached("tenant-1", request2, () -> { fetchCount++; return new FetchResult("form2", null); });

        assertThat(result1.data()).isEqualTo("form1");
        assertThat(result2.data()).isEqualTo("form2");
        assertThat(fetchCount).isEqualTo(2);
    }
}
