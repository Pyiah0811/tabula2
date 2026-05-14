<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

require_once __DIR__ . '/config/database.php';

try {
    // Fetch all buildings
    $stmt = $conn->query("SELECT * FROM buildings ORDER BY id ASC");
    $buildings = $stmt->fetchAll();

    // Fetch all floors
    $floorStmt = $conn->query("SELECT * FROM floors ORDER BY building_id, floor_level ASC");
    $allFloors = $floorStmt->fetchAll();

    // Fetch all rooms
    $roomStmt = $conn->query("SELECT * FROM rooms ORDER BY floor_id, id ASC");
    $allRooms = $roomStmt->fetchAll();

    // Group rooms by floor_id
    $roomsByFloor = [];
    foreach ($allRooms as $room) {
        $roomsByFloor[$room['floor_id']][] = $room['room_name'];
    }

    // Group floors (with rooms) by building_id
    $floorsByBuilding = [];
    foreach ($allFloors as $floor) {
        $floorsByBuilding[$floor['building_id']][] = [
            'level' => (int)$floor['floor_level'],
            'rooms' => $roomsByFloor[$floor['id']] ?? []
        ];
    }

    $result = [];
    foreach ($buildings as $row) {
        $result[] = [
            "id"          => (int)$row['id'],
            "name"        => $row['name'],
            "description" => $row['description'],
            "floors"      => $floorsByBuilding[$row['id']] ?? [],

            "x"      => (int)$row['map_x'],
            "y"      => (int)$row['map_y'],
            "width"  => (int)$row['width'],
            "height" => (int)$row['height'],
            "frames" => (int)$row['frames'],
            "image"  => $row['image'],

            "zone" => [
                "x"      => (float)$row['zone_x'],
                "y"      => (float)$row['zone_y'],
                "width"  => (float)$row['zone_w'],
                "height" => (float)$row['zone_h'],
            ],
            "collision" => [
                "x"      => (float)$row['col_x'],
                "y"      => (float)$row['col_y'],
                "width"  => (float)$row['col_w'],
                "height" => (float)$row['col_h'],
            ],
        ];
    }

    echo json_encode($result, JSON_PRETTY_PRINT);

} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(["error" => "Query failed"]);
}
?>