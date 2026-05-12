<?php
// DDG Lite search proxy — CORS bridge for non-Cloudflare deployments.
// Only proxies lite.duckduckgo.com (hardcoded — cannot be abused to fetch arbitrary URLs).
// Usage: /api/search.php?q=<search+query>

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: *');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$q = $_GET['q'] ?? '';
if (!$q) {
    http_response_code(400);
    echo 'missing q';
    exit;
}

$url = 'https://lite.duckduckgo.com/lite?q=' . urlencode($q);
$resp = @file_get_contents($url, false, stream_context_create([
    'http' => [
        'method' => 'GET',
        'header' => "User-Agent: bsky-client/1.0\r\n",
        'timeout' => 10,
    ],
]));

if ($resp === false) {
    http_response_code(502);
    echo 'proxy error: failed to fetch';
    exit;
}

header('Content-Type: text/html; charset=utf-8');
echo $resp;
