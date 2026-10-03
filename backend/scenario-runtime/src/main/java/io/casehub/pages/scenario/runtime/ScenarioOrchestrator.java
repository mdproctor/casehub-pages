package io.casehub.pages.scenario.runtime;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.casehub.pages.push.EventBroadcaster;
import io.casehub.pages.push.PushMessage;
import io.casehub.pages.push.PushRequest;
import io.casehub.pages.push.SessionSender;
import io.casehub.pages.scenario.CompactStep;
import io.casehub.pages.scenario.ScenarioEnvelope;
import io.casehub.pages.scenario.ScenarioEnvelopeParser;
import io.casehub.pages.scenario.NarrativeContent;
import io.casehub.pages.scenario.OutlineNode;
import io.casehub.pages.scenario.SimulationSpec;
import io.casehub.platform.simulation.MapSimulationConfig;
import io.casehub.platform.simulation.SimulationOverlay;
import io.casehub.platform.simulation.SimulationRuntime;
import io.casehub.platform.simulation.config.YamlCorpusLoader;
import io.casehub.platform.simulation.event.quarkus.TemporalDriverService;
import io.casehub.platform.simulation.event.quarkus.TemporalDriverSpeedRequest;
import io.casehub.platform.simulation.event.quarkus.TemporalDriverStartRequest;
import io.casehub.platform.simulation.event.quarkus.TemporalEventInput;
import io.casehub.platform.simulation.inmem.InMemorySimulationCorpus;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.inject.Instance;
import jakarta.inject.Inject;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.stream.Collectors;

@ApplicationScoped
public class ScenarioOrchestrator {

    private static final ObjectMapper JSON = new ObjectMapper();

    private final SessionSender    sender;
    private final EventBroadcaster broadcaster;
    private final ExecutorRegistry executorRegistry = new ExecutorRegistry();

    @Inject Instance<SimulationRuntime> simulationRuntimeInstance;
    @Inject Instance<TemporalDriverService> temporalDriverServiceInstance;
    private volatile SimulationOverlay activeOverlay;

    private volatile String                             sessionId;
    private volatile ScenarioEnvelope                   envelope;
    private volatile List<CompactStep>                  allSteps;
    private final    ConcurrentHashMap<String, Boolean> completedSteps = new ConcurrentHashMap<>();
    private final    AtomicBoolean                      callbackFired  = new AtomicBoolean(false);
    private volatile boolean                            paused;
    private volatile double                             speed          = 1.0;
    private volatile String                             runToTarget;
    private volatile String                             callbackUrl;
    private volatile String                             dispatchId;
    private volatile String                             callbackToken;
    private final    ConcurrentHashMap<String, Map<String, Object>> stepResults = new ConcurrentHashMap<>();


    @Inject
    public ScenarioOrchestrator(SessionSender sender, EventBroadcaster broadcaster) {
        this.sender      = sender;
        this.broadcaster = broadcaster;
    }

    public void start(String yaml) {
        start(yaml, false);
    }

    public void start(String yaml, boolean startPaused) {
        this.envelope  = ScenarioEnvelopeParser.parse(yaml);
        this.allSteps  = envelope.allSteps();
        this.sessionId = UUID.randomUUID().toString();
        this.completedSteps.clear();
        this.callbackFired.set(false);
        this.paused      = startPaused;
        this.speed       = envelope.speed();
        this.runToTarget = null;

        activateSimulation(this.envelope.simulation());
        validateExecutors();
        dispatchAllSequences();
        broadcastState();
    }

    public void start(String yaml, boolean startPaused,
                      String callbackUrl, String dispatchId, String callbackToken) {
        this.callbackUrl   = callbackUrl;
        this.dispatchId    = dispatchId;
        this.callbackToken = callbackToken;
        this.stepResults.clear();
        start(yaml, startPaused);
    }


    public void stop() {
        if (this.sessionId == null) {return;}
        deactivateSimulation();
        stopTemporalDrivers();
        broadcastControl("stop", null);
        this.sessionId = null;
        this.envelope  = null;
        this.allSteps  = List.of();
        this.completedSteps.clear();
        this.stepResults.clear();
        this.callbackUrl   = null;
        this.dispatchId    = null;
        this.callbackToken = null;
        this.paused        = false;
        this.speed         = 1.0;
        this.runToTarget   = null;
        broadcastState();
    }

    public void pause() {
        requireSession();
        this.paused = true;
        broadcastControl("pause", null);
        broadcastState();
    }

    public void resume() {
        requireSession();
        this.paused = false;
        broadcastControl("resume", null);
        broadcastState();
    }

    public void step() {
        requireSession();
        broadcastControl("step", null);
    }

    public RunToResult runTo(String label) {
        requireSession();
        int targetIndex = findStepIndex(label);
        if (targetIndex < 0) {return RunToResult.NOT_FOUND;}

        int currentIndex = completedSteps.size();
        if (targetIndex < currentIndex) {return RunToResult.ALREADY_PAST;}

        this.runToTarget = label;
        this.paused      = false;
        this.speed       = 10.0;
        broadcastControl("speed", 10.0);
        broadcastControl("resume", null);
        broadcastState();
        return RunToResult.OK;
    }

    public void speed(double newSpeed) {
        requireSession();
        if (newSpeed <= 0) {throw new IllegalArgumentException("Speed must be > 0");}
        this.speed = Math.max(0.01, newSpeed);
        broadcastControl("speed", this.speed);
        broadcastState();
    }

    public ScenarioState state() {
        if (envelope == null) {return ScenarioState.idle();}

        String currentChapter = null;
        String currentSection = null;
        String currentStep    = null;

        int              completed = completedSteps.size();
        NarrativeContent content   = null;
        if (!allSteps.isEmpty() && completed < allSteps.size()) {
            var step = allSteps.get(completed);
            currentStep    = step.decorator("label");
            currentSection = findSectionLabel(completed);
            currentChapter = findChapterLabel(completed);
            content        = resolveContent(completed);
        }

        double progress = allSteps.isEmpty() ? 1.0
                                             : (double) completed / allSteps.size();

        return new ScenarioState(envelope.scenario(), currentChapter,
                                 currentSection, currentStep, paused, speed, progress,
                                 content, envelope.slides());
    }

    public String sessionId() {
        return sessionId;
    }

    public List<OutlineNode> outline() {
        if (envelope == null) {return List.of();}
        return buildOutline(envelope);
    }

    public void onExecutorRegister(String connectionId, PushRequest.ExecutorRegister reg) {
        boolean reRegistered = false;
        if (sessionId != null) {
            var existing = executorRegistry.get(reg.name());
            if (existing != null && !existing.connectionId().equals(connectionId)) {
                reRegistered = true;
            }
        }
        executorRegistry.register(connectionId, reg);
        if (reRegistered) {
            redispatchPending(reg.name());
        }
    }

    private void redispatchPending(String target) {
        if (allSteps == null) return;
        for (int i = 0; i < allSteps.size(); i++) {
            var step = allSteps.get(i);
            String stepTarget = step.decorator("target");
            if (!target.equals(stepTarget)) continue;
            String stepName = ScenarioEnvelopeParser.deriveStepName(step, i);
            if (completedSteps.containsKey(stepName)) continue;
            boolean triggerSatisfied = step.trigger() == null
                || (step.trigger() instanceof io.casehub.pages.scenario.Trigger.AfterTrigger after
                    && completedSteps.containsKey(after.step()));
            if (triggerSatisfied) {
                dispatchSequence(new SequencePartitioner.StepSequence(
                    stepTarget, List.of(step)));
                break;
            }
        }
    }

    public void onStepResult(PushRequest.StepResult result) {
        if (sessionId == null || !sessionId.equals(result.sessionId())) {return;}
        completedSteps.put(result.stepName(), result.ok());
        if (result.result() != null) {
            stepResults.put(result.stepName(), result.result());
        }

        if (!result.ok() && envelope != null && "stop".equals(envelope.onError())) {
            broadcastControl("stop", null);
            fireCallback(true, "Step '" + result.stepName() + "' failed: " + result.error());
            broadcastState();
            return;
        }

        String stepLabel = resolveLabel(result.stepName());
        if (runToTarget != null && (runToTarget.equals(result.stepName()) || runToTarget.equals(stepLabel))) {
            runToTarget = null;
            this.speed  = envelope != null ? envelope.speed() : 1.0;
            broadcastControl("speed", this.speed);
            pause();
        } else {
            broadcastState();
        }
        if (result.ok()) {
            dispatchTriggeredSteps(result.stepName());
        }

        if (completedSteps.size() == allSteps.size() && callbackFired.compareAndSet(false, true)) {
            boolean anyFailed = completedSteps.values().stream().anyMatch(ok -> !ok);
            fireCallback(anyFailed, anyFailed ? "One or more steps failed" : null);
        }
    }

    private void broadcastState() {
        broadcaster.broadcast("scenario:state", state());
    }

    record WorkerCompletionPayload(Map<String, Object> output, boolean faulted, String errorMessage) {}

    private void fireCallback(boolean faulted, String errorMessage) {
        if (callbackUrl == null) {return;}

        Map<String, Object> output  = new java.util.LinkedHashMap<>(stepResults);
        var                 payload = new WorkerCompletionPayload(output, faulted, errorMessage);

        Thread.ofVirtual().start(() -> {
            try {
                var client = java.net.http.HttpClient.newHttpClient();
                var body   = JSON.writeValueAsString(payload);
                var request = java.net.http.HttpRequest.newBuilder()
                                                       .uri(java.net.URI.create(callbackUrl + "/" + dispatchId))
                                                       .header("Content-Type", "application/json")
                                                       .header("X-Casehub-Callback-Token", callbackToken != null ? callbackToken : "")
                                                       .POST(java.net.http.HttpRequest.BodyPublishers.ofString(body))
                                                       .build();
                var response = client.send(request, java.net.http.HttpResponse.BodyHandlers.discarding());
                if (response.statusCode() >= 400) {
                    System.err.println("Callback to " + callbackUrl + " returned " + response.statusCode());
                }
            } catch (Exception e) {
                System.err.println("Callback to " + callbackUrl + " failed: " + e.getMessage());
            }
        });
    }


    private void validateExecutors() {
        var missingExecutors = allSteps.stream()
                                       .filter(s -> s.temporal() == null)
                                       .map(s -> (String) s.decorator("target"))
                                       .filter(java.util.Objects::nonNull)
                                       .distinct()
                                       .filter(t -> !executorRegistry.hasExecutor(t))
                                       .toList();
        if (!missingExecutors.isEmpty()) {
            throw new IllegalStateException(
                    "Missing executors: " + missingExecutors);
        }
    }

    private void dispatchAllSequences() {
        for (int i = 0; i < allSteps.size(); i++) {
            var step = allSteps.get(i);
            if (step.temporal() != null && step.trigger() == null) {
                handleTemporalStep(step, i);
                continue;
            }
        }
        var nonTemporal = allSteps.stream()
                                  .filter(s -> s.temporal() == null)
                                  .toList();
        var sequences = SequencePartitioner.partitionInitial(nonTemporal);
        for (var seq : sequences) {
            dispatchSequence(seq);
        }
    }

    private void dispatchTriggeredSteps(String completedStepName) {
        for (int i = 0; i < allSteps.size(); i++) {
            var step = allSteps.get(i);
            final int stepIndex = i;
            if (step.trigger() instanceof io.casehub.pages.scenario.Trigger.AfterTrigger after
                && after.step().equals(completedStepName)) {
                long delay = after.delayMs();
                String stepTarget = step.decorator("target");
                if (step.temporal() != null) {
                    if (delay > 0) {
                        Thread.ofVirtual().start(() -> {
                            try {Thread.sleep(delay);} catch (InterruptedException e) {return;}
                            handleTemporalStep(step, stepIndex);
                        });
                    } else {
                        handleTemporalStep(step, stepIndex);
                    }
                } else {
                    if (delay > 0) {
                        Thread.ofVirtual().start(() -> {
                            try {Thread.sleep(delay);} catch (InterruptedException e) {return;}
                            dispatchSequence(new SequencePartitioner.StepSequence(
                                    stepTarget, List.of(step)));
                        });
                    } else {
                        dispatchSequence(new SequencePartitioner.StepSequence(
                                stepTarget, List.of(step)));
                    }
                }
            }
        }
    }

    private void dispatchSequence(SequencePartitioner.StepSequence seq) {
        var executor = executorRegistry.get(seq.target());
        if (executor == null) {return;}

        String stepsJson = serializeSteps(seq.steps());
        String msg = PushMessage.dispatchSequence(
                sessionId, seq.target(), stepsJson, speed, paused);
        sender.send(executor.connectionId(), msg);
    }

    private String serializeSteps(List<CompactStep> steps) {
        var stepMaps = new ArrayList<Map<String, Object>>();
        for (int i = 0; i < steps.size(); i++) {
            var step = steps.get(i);
            var map = new java.util.LinkedHashMap<String, Object>();
            map.put("name", ScenarioEnvelopeParser.deriveStepName(step, i));
            String label = step.decorator("label");
            if (label != null) map.put("label", label);
            String actor = step.decorator("actor");
            if (actor != null) map.put("actor", actor);
            map.put("action", step.action());
            map.put("params", step.params());
            Object await = step.decorator("await");
            if (await != null) map.put("await", await);
            String mode = step.decorator("mode");
            if (mode != null) map.put("mode", mode);
            stepMaps.add(map);
        }
        try {
            return JSON.writeValueAsString(stepMaps);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Failed to serialize steps", e);
        }
    }

    private void broadcastControl(String command, Double controlSpeed) {
        String msg = PushMessage.executorControl(sessionId, command, controlSpeed);
        for (var executor : executorRegistry.all()) {
            sender.send(executor.connectionId(), msg);
        }
    }

    private List<OutlineNode> buildOutline(ScenarioEnvelope env) {
        if (!env.chapters().isEmpty()) {
            return env.chapters().stream()
                    .map(c -> new OutlineNode(c.label(),
                                              c.sections().stream()
                                               .map(sec -> new OutlineNode(sec.label(),
                                                                           sec.steps().stream()
                                                                              .map(this::stepToOutline)
                                                                              .toList()))
                                               .toList()))
                    .toList();
        }
        if (!env.sections().isEmpty()) {
            return env.sections().stream()
                    .map(sec -> new OutlineNode(sec.label(),
                                                sec.steps().stream()
                                                   .map(this::stepToOutline)
                                                   .toList()))
                    .toList();
        }
        if (!env.steps().isEmpty()) {
            return env.steps().stream()
                    .map(this::stepToOutline)
                    .toList();
        }
        return List.of();
    }

    private OutlineNode stepToOutline(CompactStep st) {
        return new OutlineNode(st.decorator("label"), st.decorator("target"), st.action());
    }

    private String resolveLabel(String stepName) {
        if (allSteps == null) return stepName;
        for (int i = 0; i < allSteps.size(); i++) {
            var step = allSteps.get(i);
            String name = ScenarioEnvelopeParser.deriveStepName(step, i);
            if (name.equals(stepName)) {
                String label = step.decorator("label");
                return label != null ? label : stepName;
            }
        }
        return stepName;
    }

    private int findStepIndex(String label) {
        for (int i = 0; i < allSteps.size(); i++) {
            String stepLabel = allSteps.get(i).decorator("label");
            if (label.equals(stepLabel)) {return i;}
        }
        return -1;
    }

    private String findSectionLabel(int stepIndex) {
        if (!envelope.sections().isEmpty()) {
            int offset = 0;
            for (var section : envelope.sections()) {
                if (stepIndex < offset + section.steps().size()) {
                    return section.label();
                }
                offset += section.steps().size();
            }
        }
        if (!envelope.chapters().isEmpty()) {
            int offset = 0;
            for (var chapter : envelope.chapters()) {
                for (var section : chapter.sections()) {
                    if (stepIndex < offset + section.steps().size()) {
                        return section.label();
                    }
                    offset += section.steps().size();
                }
            }
        }
        return null;
    }

    private String findChapterLabel(int stepIndex) {
        if (envelope.chapters().isEmpty()) {return null;}
        int offset = 0;
        for (var chapter : envelope.chapters()) {
            int chapterSize = chapter.sections().stream()
                                     .mapToInt(s -> s.steps().size()).sum();
            if (stepIndex < offset + chapterSize) {
                return chapter.label();
            }
            offset += chapterSize;
        }
        return null;
    }

    private NarrativeContent resolveContent(int stepIndex) {
        var step = allSteps.get(stepIndex);
        String stepContent = step.decorator("content");
        if (stepContent != null) {return new NarrativeContent.Inline(stepContent);}

        if (!envelope.sections().isEmpty()) {
            int offset = 0;
            for (var section : envelope.sections()) {
                if (stepIndex < offset + section.steps().size()) {
                    return section.content() != null ? new NarrativeContent.Inline(section.content()) : null;
                }
                offset += section.steps().size();
            }
        }
        if (!envelope.chapters().isEmpty()) {
            int offset = 0;
            for (var chapter : envelope.chapters()) {
                for (var section : chapter.sections()) {
                    if (stepIndex < offset + section.steps().size()) {
                        if (section.content() != null) {return new NarrativeContent.Inline(section.content());}
                        return chapter.content() != null ? new NarrativeContent.Inline(chapter.content()) : null;
                    }
                    offset += section.steps().size();
                }
            }
        }
        return null;
    }

    @SuppressWarnings({"rawtypes", "unchecked"})
    private void activateSimulation(SimulationSpec spec) {
        if (spec == null || !simulationRuntimeInstance.isResolvable()) return;
        var runtime = simulationRuntimeInstance.get();
        var config = MapSimulationConfig.of(spec.strategies(),
                spec.capture().stream().collect(Collectors.toMap(c -> c, c -> true)));
        var corpus = new InMemorySimulationCorpus<>();

        if (!spec.corpus().isEmpty()) {
            var loader = new YamlCorpusLoader();
            var loaded = loader.loadFromPaths(spec.corpus(), "default-tenant");
            loaded.forEach(corpus::seed);
        }

        this.activeOverlay = runtime.pushOverlay(config, corpus);
    }

    private void deactivateSimulation() {
        if (activeOverlay == null || !simulationRuntimeInstance.isResolvable()) return;
        simulationRuntimeInstance.get().popOverlay(activeOverlay);
        activeOverlay = null;
    }

    private void stopTemporalDrivers() {
        if (!temporalDriverServiceInstance.isResolvable()) {return;}
        var service = temporalDriverServiceInstance.get();
        for (var status : service.list()) {
            try {
                service.stop(status.name());
            } catch (Exception ignored) {
            }
        }
    }


    private void handleTemporalStep(CompactStep step, int stepIndex) {
        if (!temporalDriverServiceInstance.isResolvable()) {
            throw new IllegalStateException("TemporalDriverService not available");
        }
        var service = temporalDriverServiceInstance.get();
        var spec    = step.temporal();
        switch (spec.action()) {
            case START -> {
                List<TemporalEventInput> events = spec.events() == null ? null
                                                                        : spec.events().stream()
                                                                              .map(e -> new TemporalEventInput(e.delay(), e.label(), e.payload()))
                                                                              .toList();
                service.start(new TemporalDriverStartRequest(
                        spec.name(), spec.profile(), spec.qualifiedName(),
                        spec.tenancyId(), events, spec.loop(), spec.speed()));
            }
            case STOP -> service.stop(spec.effectiveName());
            case PAUSE -> service.pause(spec.effectiveName());
            case RESUME -> service.resume(spec.effectiveName());
            case SET_SPEED -> service.setSpeed(
                    new TemporalDriverSpeedRequest(spec.effectiveName(), spec.speed()));
        }
        String stepName = ScenarioEnvelopeParser.deriveStepName(step, stepIndex);
        completedSteps.put(stepName, true);
        broadcastState();
        dispatchTriggeredSteps(stepName);
    }


    private void requireSession() {
        if (sessionId == null) {
            throw new IllegalStateException("No active session");
        }
    }
}
