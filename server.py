#!/usr/bin/env python3
"""
WortMeister PWA - Local Dev & Mobile Test Server
Serves the PWA locally with proper MIME types, caching headers, and displays your local Wi-Fi IP for direct mobile phone testing.
"""

import http.server
import socket
import socketserver
import os
import sys

# Ensure UTF-8 stdout on Windows console
if sys.platform.startswith('win'):
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

PORT = 8080
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

def get_local_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"

class PWAHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def guess_type(self, path):
        if path.endswith('.json') or path.endswith('manifest.json'):
            return 'application/manifest+json'
        if path.endswith('.js'):
            return 'application/javascript; charset=utf-8'
        if path.endswith('.css'):
            return 'text/css; charset=utf-8'
        if path.endswith('.png'):
            return 'image/png'
        if path.endswith('.jpg') or path.endswith('.jpeg'):
            return 'image/jpeg'
        return super().guess_type(path)

    def end_headers(self):
        # Disable aggressive caching in dev mode so updates reflect immediately
        self.send_header('Cache-Control', 'no-cache, must-revalidate')
        self.send_header('Access-Control-Allow-Origin', '*')
        super().end_headers()

def run_server():
    local_ip = get_local_ip()
    handler = PWAHTTPRequestHandler

    # Allow address reuse
    socketserver.TCPServer.allow_reuse_address = True

    try:
        with socketserver.TCPServer(("0.0.0.0", PORT), handler) as httpd:
            print("=" * 64)
            print("  🚀 WortMeister PWA Test Sunucusu Başlatıldı!")
            print("=" * 64)
            print(f"  💻 Bilgisayarınızda (Desktop):  http://localhost:{PORT}")
            print(f"  📱 Telefonunuzda (Mobil Wi-Fi): http://{local_ip}:{PORT}")
            print("=" * 64)
            print("  Kurulum (PWA):")
            print("  - Chrome / Android: Menüden 'Uygulamayı Yükle' veya 'Ana Ekrana Ekle'")
            print("  - Safari / iOS: Paylaş (Share) butonundan 'Ana Ekrana Ekle'")
            print("=" * 64)
            print("  Durdurmak için Ctrl+C tuşlarına basın.\n")
            httpd.serve_forever()
    except OSError as e:
        if e.errno == 98 or "address already in use" in str(e).lower() or "winerror 10048" in str(e).lower():
            alt_port = PORT + 1
            print(f"Port {PORT} meşgul, {alt_port} deneniyor...")
            with socketserver.TCPServer(("0.0.0.0", alt_port), handler) as httpd:
                print(f"  💻 Masaüstü: http://localhost:{alt_port}")
                print(f"  📱 Mobil:    http://{local_ip}:{alt_port}")
                httpd.serve_forever()
        else:
            raise e

if __name__ == '__main__':
    run_server()
