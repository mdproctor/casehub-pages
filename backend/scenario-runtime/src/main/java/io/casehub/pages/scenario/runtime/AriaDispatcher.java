package io.casehub.pages.scenario.runtime;

import io.casehub.pages.push.EventBroadcaster;
import io.casehub.pages.push.PushRequest;
import io.casehub.pages.scenario.CompactStep;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.event.Observes;
import jakarta.inject.Inject;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

@ApplicationScoped
public class AriaDispatcher {

    private static final String TOPIC = "scenario:exec";
    private static final long DEFAULT_TIMEOUT_MS = 30_000;
    private static final long READY_PROBE_INTERVAL_MS = 500;

    private final EventBroadcaster broadcaster;
    private final long timeoutMs;
    private final Map<String, CompletableFuture<PushRequest.CommandResult>> pending
            = new ConcurrentHashMap<>();

    public record CommandPayload(String id, String action, Object target,
                                 String value, Map<String, Object> state,
                                 Integer timeout) {}

    @Inject
    public AriaDispatcher(EventBroadcaster broadcaster) {
        this(broadcaster, DEFAULT_TIMEOUT_MS);
    }

    AriaDispatcher(EventBroadcaster broadcaster, long timeoutMs) {
        this.broadcaster = broadcaster;
        this.timeoutMs = timeoutMs;
    }

    public PushRequest.CommandResult send(CompactStep step) {
        var target = extractTarget(step.params());
        var value  = (String) step.params().get("value");
        @SuppressWarnings("unchecked")
        var state = (Map<String, Object>) step.params().get("state");
        var     timeoutParam = step.params().get("timeout");
        Integer stepTimeout  = timeoutParam instanceof Number n ? n.intValue() : null;
        var     result       = sendCommand(step.action(), target, value, state, stepTimeout);

        if ("navigate".equals(step.action())) {
            waitForPageLoad(stepTimeout);
        }

        return result;
    }

    public PushRequest.CommandResult sendBatch(List<CompactStep> steps) {
        if (steps.size() == 1) {
            return send(steps.getFirst());
        }
        var id     = UUID.randomUUID().toString();
        var future = new CompletableFuture<PushRequest.CommandResult>();
        pending.put(id, future);

        try {
            for (CompactStep step : steps) {
                var target = extractTarget(step.params());
                var value  = (String) step.params().get("value");
                @SuppressWarnings("unchecked")
                var state = (Map<String, Object>) step.params().get("state");
                var     timeoutParam = step.params().get("timeout");
                Integer stepTimeout  = timeoutParam instanceof Number n ? n.intValue() : null;
                var     payload      = new CommandPayload(id, step.action(), target, value, state, stepTimeout);
                broadcaster.broadcast(TOPIC, payload);
            }
            return awaitResult(future, effectiveTimeout(null));
        } finally {
            pending.remove(id);
        }
    }

    void onCommandResult(@Observes PushRequest.CommandResult result) {
        var future = pending.get(result.id());
        if (future != null) {
            future.complete(result);
        }
    }

    public int pendingCount() {
        return pending.size();
    }

    private PushRequest.CommandResult sendCommand(String action, Object target,
                                                   String value, Map<String, Object> state,
                                                   Integer timeout) {
        var id = UUID.randomUUID().toString();
        var future = new CompletableFuture<PushRequest.CommandResult>();
        pending.put(id, future);

        try {
            var payload = new CommandPayload(id, action, target, value, state, timeout);
            broadcaster.broadcast(TOPIC, payload);
            var result = awaitResult(future, effectiveTimeout(timeout));
            if (!result.ok()) {
                throw new AriaCommandException(
                        "ARIA command '" + action + "' failed: " + result.error());
            }
            return result;
        } finally {
            pending.remove(id);
        }
    }

    private void waitForPageLoad(Integer stepTimeout) {
        long deadline = System.currentTimeMillis() + effectiveTimeout(stepTimeout);

        while (System.currentTimeMillis() < deadline) {
            var probeId = UUID.randomUUID().toString();
            var probeFuture = new CompletableFuture<PushRequest.CommandResult>();
            pending.put(probeId, probeFuture);

            try {
                var probe = new CommandPayload(probeId, "ready", null, null, null, null);
                broadcaster.broadcast(TOPIC, probe);
                probeFuture.get(READY_PROBE_INTERVAL_MS, TimeUnit.MILLISECONDS);
                return;
            } catch (TimeoutException e) {
                // No response — page still loading, retry
            } catch (Exception e) {
                throw new AriaCommandException("Ready probe failed", e);
            } finally {
                pending.remove(probeId);
            }
        }

        throw new AriaCommandException(
                "Page load timed out after " + effectiveTimeout(stepTimeout) + "ms");
    }

    private PushRequest.CommandResult awaitResult(
            CompletableFuture<PushRequest.CommandResult> future, long timeout) {
        try {
            return future.get(timeout, TimeUnit.MILLISECONDS);
        } catch (TimeoutException e) {
            throw new AriaCommandException(
                    "Command timed out after " + timeout + "ms");
        } catch (Exception e) {
            throw new AriaCommandException("Command failed: " + e.getMessage(), e);
        }
    }

    private long effectiveTimeout(Integer stepTimeout) {
        return stepTimeout != null ? stepTimeout : timeoutMs;
    }

    private static Map<String, Object> extractTarget(Map<String, Object> params) {
        var target = new java.util.LinkedHashMap<String, Object>();
        if (params.containsKey("role")) {target.put("role", params.get("role"));}
        if (params.containsKey("name")) {target.put("name", params.get("name"));}
        if (params.containsKey("index")) {target.put("index", params.get("index"));}
        if (params.containsKey("within")) {target.put("within", params.get("within"));}
        return target.isEmpty() ? null : target;
    }

}
