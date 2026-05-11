<?php
header('Content-Type: application/json');
require_once __DIR__ . '/config/database.php';

$id = isset($_GET['id']) ? (int)$_GET['id'] : 0;

if ($id <= 0) {
    echo json_encode(["status" => "error", "message" => "Invalid Building ID"]);
    exit;
}

try {
    // 1. Get the main building data
    $stmt = $conn->prepare("SELECT * FROM buildings WHERE id = ?");
    $stmt->execute([$id]);
    $building = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$building) {
        echo json_encode(["status" => "error", "message" => "Building not found"]);
        exit;
    }

    // 2. Grab the floors and bundle the rooms together for the UI
    $sql = "SELECT f.floor_level as level, GROUP_CONCAT(r.room_name SEPARATOR ', ') as rooms
            FROM floors f
            LEFT JOIN rooms r ON f.id = r.floor_id
            WHERE f.building_id = ?
            GROUP BY f.id, f.floor_level
            ORDER BY f.floor_level ASC";

    $stmt = $conn->prepare($sql);
    $stmt->execute([$id]);
    $floors = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // 3. Clean up the data types for Javascript
    foreach ($floors as &$f) {
        $f['level'] = (int)$f['level'];
        if ($f['rooms'] === null) {
            $f['rooms'] = ""; // Protect against floors that have no rooms yet
        }
    }

    $building['floors'] = $floors;
    $building['status'] = 'success';

    echo json_encode($building);

} catch (Exception $e) {
    echo json_encode(["status" => "error", "message" => $e->getMessage()]);
}
?>