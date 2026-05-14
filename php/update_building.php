<?php
header('Content-Type: application/json');
require_once __DIR__ . '/config/database.php';

$data = json_decode(file_get_contents("php://input"), true);

if (!$data || !isset($data['id'])) {
    echo json_encode(["status" => "error", "message" => "Invalid data"]);
    exit;
}

$bldgId = (int)$data['id'];
$name   = trim($data['name']        ?? '');
$desc   = trim($data['description'] ?? '');
$floors = $data['floors'] ?? [];

if (!$bldgId || $name === '') {
    echo json_encode(["status" => "error", "message" => "Missing required fields"]);
    exit;
}

try {
    $conn->beginTransaction();

    // 1. Update building basic info
    $stmt = $conn->prepare("UPDATE buildings SET name = ?, description = ? WHERE id = ?");
    $stmt->execute([$name, $desc, $bldgId]);

    // 2. Clear old floors (CASCADE deletes rooms automatically)
    $stmt = $conn->prepare("DELETE FROM floors WHERE building_id = ?");
    $stmt->execute([$bldgId]);

    // 3. Insert new floors and rooms
    foreach ($floors as $f) {
        $level = (int)($f['level'] ?? 1);

        $stmt = $conn->prepare("INSERT INTO floors (building_id, floor_level) VALUES (?, ?)");
        $stmt->execute([$bldgId, $level]);
        $floorId = $conn->lastInsertId();

        // rooms is now always a plain string[] from edit_building.html
        $rooms = $f['rooms'] ?? [];

        // Defensive: if someone sends a comma-string instead of array, split it
        if (is_string($rooms)) {
            $rooms = array_filter(array_map('trim', explode(',', $rooms)));
        }

        foreach ($rooms as $roomName) {
            $roomName = trim((string)$roomName);
            if ($roomName !== '') {
                $stmt = $conn->prepare("INSERT INTO rooms (floor_id, room_name) VALUES (?, ?)");
                $stmt->execute([$floorId, $roomName]);
            }
        }
    }

    $conn->commit();
    echo json_encode(["status" => "success"]);

} catch (Exception $e) {
    $conn->rollBack();
    echo json_encode(["status" => "error", "message" => $e->getMessage()]);
}
?>