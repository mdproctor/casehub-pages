package io.casehub.pages.layout.sqlite;

import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import io.casehub.pages.layout.LayoutPersistenceStore;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import jakarta.enterprise.context.ApplicationScoped;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.flywaydb.core.Flyway;
import org.sqlite.SQLiteConfig;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Optional;

@ApplicationScoped
public class SqliteLayoutPersistenceStore implements LayoutPersistenceStore {

    @ConfigProperty(name = "casehub.pages.layout.sqlite.path")
    String path;

    @ConfigProperty(name = "casehub.pages.layout.sqlite.pool.max-size", defaultValue = "5")
    int maxPoolSize;

    @ConfigProperty(name = "casehub.pages.layout.sqlite.busy-timeout-ms", defaultValue = "5000")
    int busyTimeoutMs;

    private HikariDataSource dataSource;

    @PostConstruct
    void init() {
        boolean isMemory = ":memory:".equals(path) || path.isBlank();
        int effectivePoolSize = isMemory ? 1 : maxPoolSize;

        SQLiteConfig sqLiteConfig = new SQLiteConfig();
        if (!isMemory) {
            sqLiteConfig.setJournalMode(SQLiteConfig.JournalMode.WAL);
        }
        sqLiteConfig.setSynchronous(SQLiteConfig.SynchronousMode.NORMAL);
        sqLiteConfig.setBusyTimeout(busyTimeoutMs);
        sqLiteConfig.setCacheSize(64000);

        // Use SQLiteDataSource(SQLiteConfig) constructor so pragma config is type-safe.
        // Wrap in HikariCP using setDataSource() — avoids PropertyElf string-coercion problems.
        org.sqlite.SQLiteDataSource sqLiteDataSource = new org.sqlite.SQLiteDataSource(sqLiteConfig);
        sqLiteDataSource.setUrl("jdbc:sqlite:" + path);

        HikariConfig hikari = new HikariConfig();
        hikari.setDataSource(sqLiteDataSource);
        hikari.setMaximumPoolSize(effectivePoolSize);
        hikari.setMinimumIdle(1);

        dataSource = new HikariDataSource(hikari);

        Flyway.configure()
            .dataSource(dataSource)
            .locations("classpath:db/layout-sqlite/migration")
            .load()
            .migrate();
    }

    @PreDestroy
    void shutdown() {
        if (dataSource != null) dataSource.close();
    }

    @Override
    public Optional<String> load(String key, String tenantId, String userId) {
        String sql = "SELECT payload FROM layout_state WHERE key=? AND tenant_id=? AND user_id=?";
        try (Connection conn = dataSource.getConnection();
             PreparedStatement ps = conn.prepareStatement(sql)) {
            ps.setString(1, key);
            ps.setString(2, tenantId);
            ps.setString(3, userId);
            try (ResultSet rs = ps.executeQuery()) {
                if (rs.next()) {
                    return Optional.of(rs.getString("payload"));
                }
                return Optional.empty();
            }
        } catch (SQLException e) {
            throw new IllegalStateException("load() failed", e);
        }
    }

    @Override
    public void save(String key, String tenantId, String userId, String payload) {
        String sql = "INSERT INTO layout_state (key, tenant_id, user_id, payload, updated_at) VALUES (?,?,?,?,?) " +
                     "ON CONFLICT(key, tenant_id, user_id) DO UPDATE SET payload=excluded.payload, updated_at=excluded.updated_at";
        String updatedAt = Instant.now().truncatedTo(ChronoUnit.MILLIS).toString();
        try (Connection conn = dataSource.getConnection();
             PreparedStatement ps = conn.prepareStatement(sql)) {
            ps.setString(1, key);
            ps.setString(2, tenantId);
            ps.setString(3, userId);
            ps.setString(4, payload);
            ps.setString(5, updatedAt);
            ps.executeUpdate();
        } catch (SQLException e) {
            throw new IllegalStateException("save() failed", e);
        }
    }

    @Override
    public void delete(String key, String tenantId, String userId) {
        String sql = "DELETE FROM layout_state WHERE key=? AND tenant_id=? AND user_id=?";
        try (Connection conn = dataSource.getConnection();
             PreparedStatement ps = conn.prepareStatement(sql)) {
            ps.setString(1, key);
            ps.setString(2, tenantId);
            ps.setString(3, userId);
            ps.executeUpdate();
        } catch (SQLException e) {
            throw new IllegalStateException("delete() failed", e);
        }
    }
}
