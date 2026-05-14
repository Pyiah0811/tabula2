<?php
header('Content-Type: application/json');

require_once __DIR__ . '/../php/config/database.php';

$data = json_decode(file_get_contents("php://input"), true);

$id = isset($data['id']) ? (int)$data['id'] : null;

if (!$id) {
    echo json_encode(["status" => "error", "message" => "Invalid user ID"]);
    exit();
}

try {
    $stmt = $conn->prepare("DELETE FROM users WHERE id = ?");
    $stmt->execute([$id]);

    if ($stmt->rowCount() === 0) {
        echo json_encode(["status" => "error", "message" => "User not found"]);
        exit();
    }

    echo json_encode(["status" => "success"]);

} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(["status" => "error", "message" => "Failed to delete user"]);
}
?>