<?php
header('Content-Type: application/json');
session_start();
require_once __DIR__ . '/config/database.php';

if (!isset($_SESSION['user']) || $_SESSION['user']['role'] !== 'superadmin') {
    echo json_encode(["status" => "error", "message" => "Access denied"]);
    exit();
}

$data = json_decode(file_get_contents("php://input"), true);

$id = $data['id'];
$role = $data['role'];

$allowed_roles = ['user', 'admin'];

if (!in_array($role, $allowed_roles)) {
    echo json_encode(["status" => "error", "message" => "Invalid role"]);
    exit();
}

try {
    $stmt = $conn->prepare("UPDATE users SET role = ? WHERE id = ?");
    $stmt->execute([$role, $id]);

    echo json_encode(["status" => "success"]);

} catch (PDOException $e) {
    echo json_encode(["status" => "error", "message" => $e->getMessage()]);
}