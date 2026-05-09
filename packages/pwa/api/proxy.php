<?php
/**
 * CORS proxy for DuckDuckGo Instant Answer API (PHP version).
 *
 * Browser fetch to DDG API carries Sec-Fetch-* headers that trigger
 * DDG's anti-scrape detection (returns empty fields). This script
 * runs server-side (PHP), so DDG returns full data.
 *
 * Usage: /api/proxy.php?url=<encoded DDG API URL>
 *
 * Deploy: copy this file to any PHP-capable web server.
 *         No dependencies, no frameworks, no Composer.
 *         PHP 8.0+ (str_starts_with) or PHP 7.x with minor change.
 */

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: *');

// CORS preflight
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$url = $_GET['url'] ?? '';
if (!$url) {
    http_response_code(400);
    echo json_encode(['error' => 'Missing url parameter']);
    exit;
}

// Domain whitelist
if (!str_starts_with($url, 'https://api.duckduckgo.com/')) {
    http_response_code(403);
    echo json_encode(['error' => 'Domain not allowed']);
    exit;
}

$ctx = stream_context_create([
    'http' => [
        'header' => "User-Agent: bsky-client/0.9.0\r\n",
        'timeout' => 15,
    ],
]);

$body = @file_get_contents($url, false, $ctx);

if ($body === false) {
    http_response_code(502);
    echo json_encode(['error' => 'Proxy fetch failed']);
    exit;
}

// Preserve content type from DDG
foreach ($http_response_header ?? [] as $h) {
    if (stripos($h, 'Content-Type:') === 0) {
        header($h);
        break;
    }
}

echo $body;
