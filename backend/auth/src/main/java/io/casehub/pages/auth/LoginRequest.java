package io.casehub.pages.auth;

import java.util.List;

public record LoginRequest(String name, List<String> roles) {}
