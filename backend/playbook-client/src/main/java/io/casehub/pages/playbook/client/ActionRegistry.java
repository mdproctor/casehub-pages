package io.casehub.pages.playbook.client;

import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

public class ActionRegistry {

    private record ActionHandler(Object bean, Method method) {}

    private final Map<String, ActionHandler> handlers;
    private List<Object> registeredBeans = List.of();

    private ActionRegistry(Map<String, ActionHandler> handlers) {
        this.handlers = Map.copyOf(handlers);
    }

    public static ActionRegistry scan(List<Object> beans) {
        var handlers = new HashMap<String, ActionHandler>();
        for (var bean : beans) {
            Class<?> clazz = bean.getClass();
            while (clazz != null && clazz != Object.class) {
                for (var method : clazz.getDeclaredMethods()) {
                    var annotation = method.getAnnotation(PlaybookAction.class);
                    if (annotation != null && !handlers.containsKey(annotation.value())) {
                        method.setAccessible(true);
                        handlers.put(annotation.value(), new ActionHandler(bean, method));
                    }
                }
                clazz = clazz.getSuperclass();
            }
        }
        var registry = new ActionRegistry(handlers);
        registry.registeredBeans = List.copyOf(beans);
        return registry;
    }

    public Set<String> actions() {
        return handlers.keySet();
    }

    public Set<String> allActions() {
        var all = new LinkedHashSet<>(actions());
        for (var bean : registeredBeans) {
            for (var iface : getAllInterfaces(bean.getClass())) {
                if (!iface.isAnnotationPresent(PlaybookInterface.class)) continue;
                for (var m : iface.getDeclaredMethods()) {
                    if (!m.isDefault()) all.add(m.getName());
                }
            }
        }
        return all;
    }

    @SuppressWarnings("unchecked")
    public Map<String, Object> invoke(String action, ActionContext ctx) throws Exception {
        var handler = handlers.get(action);
        if (handler != null) {
            try {
                var result = handler.method().invoke(handler.bean(), ctx);
                if (result instanceof Map<?, ?> map) {
                    return (Map<String, Object>) map;
                }
                return Map.of();
            } catch (InvocationTargetException e) {
                if (e.getCause() instanceof Exception ex) throw ex;
                throw e;
            }
        }
        return invokeInterfaceMethod(action, ctx);
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> invokeInterfaceMethod(String action, ActionContext ctx) throws Exception {
        for (var bean : registeredBeans) {
            for (var iface : getAllInterfaces(bean.getClass())) {
                if (!iface.isAnnotationPresent(PlaybookInterface.class)) continue;
                for (var m : iface.getDeclaredMethods()) {
                    if (m.isDefault()) continue;
                    if (m.getName().equals(action)) {
                        m.setAccessible(true);
                        try {
                            var result = m.invoke(bean, ctx);
                            if (result instanceof Map<?, ?> map) {
                                return (Map<String, Object>) map;
                            }
                            return result != null ? Map.of("result", result) : Map.of();
                        } catch (InvocationTargetException e) {
                            if (e.getCause() instanceof Exception ex) throw ex;
                            throw e;
                        }
                    }
                }
            }
        }
        throw new IllegalArgumentException(
            "No @PlaybookAction handler or @PlaybookInterface method for: " + action);
    }

    private static Set<Class<?>> getAllInterfaces(Class<?> clazz) {
        var result = new LinkedHashSet<Class<?>>();
        for (var c = clazz; c != null; c = c.getSuperclass()) {
            collectInterfaces(c, result);
        }
        return result;
    }

    private static void collectInterfaces(Class<?> clazz, Set<Class<?>> result) {
        for (var iface : clazz.getInterfaces()) {
            if (result.add(iface)) {
                collectInterfaces(iface, result);
            }
        }
    }
}
