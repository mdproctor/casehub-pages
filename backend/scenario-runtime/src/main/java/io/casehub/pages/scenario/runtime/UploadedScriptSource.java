package io.casehub.pages.scenario.runtime;

import io.casehub.pages.scenario.ScriptDescriptor;
import io.casehub.pages.scenario.ScriptDescriptorExtractor;
import io.casehub.pages.scenario.ScriptMeta;
import io.casehub.pages.scenario.ScriptProvenance;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

public class UploadedScriptSource implements ScriptSource {

    private final Path libraryPath;
    private final Map<String, ScriptDescriptor> descriptors = new LinkedHashMap<>();
    private final Map<String, String> yamlContent = new LinkedHashMap<>();

    public UploadedScriptSource(Path libraryPath) {
        this.libraryPath = libraryPath;
        if (Files.isDirectory(libraryPath)) {
            scanDirectory();
        }
    }

    @Override
    public List<ScriptDescriptor> list() {
        return List.copyOf(descriptors.values());
    }

    @Override
    public Optional<String> getYaml(String name) {
        return Optional.ofNullable(yamlContent.get(name));
    }

    @Override
    public boolean contains(String name) {
        return descriptors.containsKey(name);
    }

    public ScriptDescriptor upload(String yaml) {
        ScriptDescriptor desc = ScriptDescriptorExtractor.extract(yaml, ScriptProvenance.UPLOADED);
        descriptors.put(desc.name(), desc);
        yamlContent.put(desc.name(), yaml);
        persistToDisk(desc.name(), yaml);
        return desc;
    }

    public ScriptDescriptor updateMeta(String name, ScriptMeta meta) {
        ScriptDescriptor existing = descriptors.get(name);
        if (existing == null) return null;
        ScriptDescriptor updated = new ScriptDescriptor(existing.name(), meta.description(),
                meta.labels(), meta.tags(), existing.params(), existing.calls(),
                existing.provenance(), existing.state(), existing.firstStepTargets());
        descriptors.put(name, updated);
        return updated;
    }

    public boolean delete(String name) {
        if (!descriptors.containsKey(name)) return false;
        descriptors.remove(name);
        yamlContent.remove(name);
        try {
            Files.deleteIfExists(libraryPath.resolve(name + ".yaml"));
        } catch (IOException ignored) {}
        return true;
    }

    private void scanDirectory() {
        try (var paths = Files.list(libraryPath)) {
            paths.filter(p -> p.toString().endsWith(".yaml") || p.toString().endsWith(".yml"))
                    .forEach(p -> {
                        try {
                            String yaml = Files.readString(p);
                            ScriptDescriptor desc = ScriptDescriptorExtractor.extract(yaml, ScriptProvenance.UPLOADED);
                            descriptors.put(desc.name(), desc);
                            yamlContent.put(desc.name(), yaml);
                        } catch (IOException | IllegalArgumentException ignored) {}
                    });
        } catch (IOException ignored) {}
    }

    private void persistToDisk(String name, String yaml) {
        try {
            Files.createDirectories(libraryPath);
            Files.writeString(libraryPath.resolve(name + ".yaml"), yaml);
        } catch (IOException e) {
            throw new RuntimeException("Failed to persist script '" + name + "'", e);
        }
    }
}
