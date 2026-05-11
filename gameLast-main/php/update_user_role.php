<?php
header('Content-Type: application/json');

// Fixed the path to be more direct
require_once __DIR__ . '/config/database.php';

$data = json_decode(file_get_contents("php://input"), true);

$id   = isset($data['id'])   ? (int)$data['id']        : null;
$role = isset($data['role']) ? trim($data['role'])      : null;

$allowed_roles = ['user', 'admin', 'superadmin'];

if (!$id) {
    echo json_encode(["status" => "error", "message" => "Invalid user ID"]);
    exit();
}

if (!$role || !in_array($role, $allowed_roles)) {
    echo json_encode(["status" => "error", "message" => "Invalid role"]);
    exit();
}

try {
    $stmt = $conn->prepare("UPDATE users SET role = ? WHERE id = ?");
    $stmt->execute([$role, $id]);

    // If 0 rows were affected, it either means the role is already the same, OR the user doesn't exist.
    if ($stmt->rowCount() === 0) {
        $checkStmt = $conn->prepare("SELECT id FROM users WHERE id = ?");
        $checkStmt->execute([$id]);
        if ($checkStmt->rowCount() === 0) {
            echo json_encode(["status" => "error", "message" => "User not found"]);
            exit();
        }
    }

    echo json_encode(["status" => "success"]);

} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(["status" => "error", "message" => "Failed to update role"]);
}
?>