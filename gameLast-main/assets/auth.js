// Inside auth.js
function logout() {
    localStorage.clear();
    // Path back to your main login page
    window.location.replace("../index.html"); 
}

function checkAdminAccess() {
    const userRole = localStorage.getItem("userRole");
    if (userRole !== 'admin' && userRole !== 'superadmin') {
        alert("Access Denied!");
        window.location.replace("../index.html"); 
    }
}