package io.casehub.pages.data.sql;

import io.agroal.api.AgroalDataSource;
import io.quarkus.runtime.Startup;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;

import java.sql.Connection;
import java.sql.SQLException;
import java.sql.Statement;

@ApplicationScoped
@Startup
public class TestSchemaInitializer {

    @Inject
    AgroalDataSource dataSource;

    void init(@jakarta.enterprise.event.Observes io.quarkus.runtime.StartupEvent event) {
        try (Connection conn = dataSource.getConnection();
             Statement stmt = conn.createStatement()) {

            stmt.execute("""
                CREATE TABLE IF NOT EXISTS sales (
                    id INT PRIMARY KEY,
                    product VARCHAR(100),
                    amount DECIMAL(10,2),
                    quantity INT,
                    region VARCHAR(50),
                    sale_date DATE
                )
                """);

            stmt.execute("MERGE INTO sales VALUES (1, 'Widget', 10.50, 5, 'North', '2024-01-15')");
            stmt.execute("MERGE INTO sales VALUES (2, 'Gadget', 25.00, 3, 'South', '2024-02-20')");
            stmt.execute("MERGE INTO sales VALUES (3, 'Widget', 10.50, 8, 'North', '2024-03-10')");
            stmt.execute("MERGE INTO sales VALUES (4, 'Doohickey', 5.75, 12, 'East', '2024-01-25')");
            stmt.execute("MERGE INTO sales VALUES (5, 'Gadget', 25.00, 2, 'North', '2024-04-05')");

        } catch (SQLException e) {
            throw new IllegalStateException("Failed to initialize test schema", e);
        }
    }
}
