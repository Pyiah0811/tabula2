<?php
header('Content-Type: application/json');

$servername = "localhost";
$username = "root";
$password = "";
$database = "tabula";
$port = 3307; 

$conn = new mysqli($servername, $username, $password, $database, $port);

if ($conn->connect_error) {
    die(json_encode(["status" => "error", "message" => "DB Connection Failed"]));
}

$data = json_decode(file_get_contents("php://input"));
$token = $data->credential;
$CLIENT_ID = "509785679401-9hlh0mcaft7miamq7j4pvl90pqqksun3.apps.googleusercontent.com";

// Verify with Google
$token_info = file_get_contents("https://oauth2.googleapis.com/tokeninfo?id_token=" . $token);
$token_data = json_decode($token_info, true);

if (!$token_data || $token_data['aud'] !== $CLIENT_ID) {
    echo json_encode(["status" => "error", "message" => "Invalid Google Token"]);
    exit();
}

$email = $token_data['email'];
$name = $token_data['name'];
$google_id = $token_data['sub'];

// Step 1: Check if user exists - Now fetching 'role' too
$stmt = $conn->prepare("SELECT username, role FROM users WHERE email = ?");
$stmt->bind_param("s", $email);
$stmt->execute();
$result = $stmt->get_result();

if ($result->num_rows > 0) {
    $user = $result->fetch_assoc();
    
    // Step 2: Check if they need to finish setup
    if (empty($user['username'])) {
        echo json_encode([
            "status" => "new_user", 
            "email" => $email, 
            "role" => $user['role'] // Send role to frontend
        ]);
    } else {
        echo json_encode([
            "status" => "login", 
            "name" => $user['username'], 
            "role" => $user['role'] // Send role to frontend
        ]);
    }
} else {
    // Step 3: Brand new user
    $default_role = 'user';
    $ins = $conn->prepare("INSERT INTO users (google_id, name, email, role) VALUES (?, ?, ?, ?)");
    $ins->bind_param("ssss", $google_id, $name, $email, $default_role);
    $ins->execute();
    
    echo json_encode([
        "status" => "new_user", 
        "email" => $email, 
        "role" => $default_role
    ]);
}

$conn->close();
?>