<?php
header('Content-Type: application/json');

require_once __DIR__ . '/config/database.php';

$data = json_decode(file_get_contents("php://input"));

$email = $data->email;
$nick = $data->username;
$role = $data->role;
$avatar = $data->avatar;

try {
    $stmt = $conn->prepare("
        UPDATE users 
        SET username = ?, role = ?, avatar = ? 
        WHERE email = ?
    ");

    $stmt->execute([$nick, $role, $avatar, $email]);

    echo json_encode(["status" => "success"]);

} catch (PDOException $e) {
    echo json_encode(["status" => "error", "message" => $e->getMessage()]);
}