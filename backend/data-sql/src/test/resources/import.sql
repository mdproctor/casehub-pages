CREATE TABLE sales (
    id INT PRIMARY KEY,
    product VARCHAR(100),
    amount DECIMAL(10,2),
    quantity INT,
    region VARCHAR(50),
    sale_date DATE
);

INSERT INTO sales VALUES (1, 'Widget', 10.50, 5, 'North', '2024-01-15');
INSERT INTO sales VALUES (2, 'Gadget', 25.00, 3, 'South', '2024-02-20');
INSERT INTO sales VALUES (3, 'Widget', 10.50, 8, 'North', '2024-03-10');
INSERT INTO sales VALUES (4, 'Doohickey', 5.75, 12, 'East', '2024-01-25');
INSERT INTO sales VALUES (5, 'Gadget', 25.00, 2, 'North', '2024-04-05');
