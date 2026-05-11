<?php
header('Content-Type: application/json');

require_once __DIR__ . '/../php/config/database.php';

try {
    // 1. Total Users (all roles)
    $resUsers = $conn->query("SELECT COUNT(*) as total FROM users");
    $totalUsers = $resUsers->fetch()['total'];

    // 2. Total Admins
    $resAdmins = $conn->query("SELECT COUNT(*) as total FROM users WHERE role IN ('admin', 'superadmin')");
    $totalAdmins = $resAdmins->fetch()['total'];

    // 3. Total Buildings
    $resBuildings = $conn->query("SELECT COUNT(*) as total FROM buildings");
    $totalBuildings = $resBuildings->fetch()['total'];

    $resNew = $conn->query("SELECT COUNT(*) as total FROM users WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)");
    $newThisWeek = $resNew->fetch()['total'];

    echo json_encode([
        "status" => "success",
        "totalUsers" => $totalUsers,
        "totalAdmins" => $totalAdmins,
        "totalBuildings" => $totalBuildings
    ]);

} catch (PDOException $e) {
    echo json_encode(["status" => "error", "message" => $e->getMessage()]);
}