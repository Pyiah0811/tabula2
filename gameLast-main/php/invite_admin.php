<?php
header('Content-Type: application/json');
require_once __DIR__ . '/config/database.php';

// ── Auth check (session-based superadmin guard) ──────────────────────────────
session_start();
$role = $_SESSION['user']['role'] ?? '';
if ($role !== 'superadmin') {
    http_response_code(403);
    echo json_encode(["status" => "error", "message" => "Access denied"]);
    exit();
}

$data = json_decode(file_get_contents("php://input"), true);

if (empty($data['email'])) {
    echo json_encode(["status" => "error", "message" => "Email is required"]);
    exit();
}

$email = trim($data['email']);

try {
    // 1. Check if email already exists in users table
    $check = $conn->prepare("SELECT id, role, status FROM users WHERE email = ?");
    $check->execute([$email]);
    $existing = $check->fetch();

    if ($existing) {
        if ($existing['role'] === 'admin' && $existing['status'] === 'active') {
            echo json_encode(["status" => "error", "message" => "This email is already an active admin"]);
            exit();
        }
        if ($existing['status'] === 'pending') {
            echo json_encode(["status" => "error", "message" => "An invite is already pending for this email"]);
            exit();
        }
    }

    // 2. Generate a secure token
    $token  = bin2hex(random_bytes(32)); // 64-char hex string
    $expiry = date('Y-m-d H:i:s', strtotime('+48 hours'));

    if ($existing) {
        // Update existing user record with new token
        $stmt = $conn->prepare("
            UPDATE users 
            SET role = 'admin', status = 'pending', invite_token = ?, token_expiry = ?
            WHERE email = ?
        ");
        $stmt->execute([$token, $expiry, $email]);
    } else {
        // Insert brand-new pending admin row
        $stmt = $conn->prepare("
            INSERT INTO users (email, role, status, invite_token, token_expiry)
            VALUES (?, 'admin', 'pending', ?, ?)
        ");
        $stmt->execute([$email, $token, $expiry]);
    }

    // 3. Build the invite link
    // In production, replace with your real domain
    $base_url   = (isset($_SERVER['HTTPS']) ? 'https' : 'http') . '://' . $_SERVER['HTTP_HOST'];
    $invite_url = $base_url . '/php/accept_invite.php?token=' . $token;

    // 4. STUB: In production, send $invite_url via email (PHPMailer / SMTP)
    //    For now we just return it in the response for testing
    echo json_encode([
        "status"     => "success",
        "message"    => "Invite generated (email stub — link below for testing)",
        "invite_url" => $invite_url,   // ← remove this line in production
        "expires_at" => $expiry
    ]);

} catch (PDOException $e) {
    echo json_encode(["status" => "error", "message" => $e->getMessage()]);
}
?>