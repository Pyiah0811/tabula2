// Inside auth.js
function logout() {
    localStorage.clear();

    // Detect current folder depth
    const currentPath = window.location.pathname;

    // If inside /works/ folder
    if (currentPath.includes('/admin/')) {
        window.location.href = '../index.html';
    } else {
        // Same directory as index.html
        window.location.href = 'index.html';
    }
}
function checkAdminAccess() {
    const userRole = localStorage.getItem("userRole");
    if (userRole !== 'admin' && userRole !== 'superadmin') {
        alert("Access Denied!");
        window.location.replace("../index.html"); 
    }
}