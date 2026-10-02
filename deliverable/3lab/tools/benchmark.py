"""Read-only catalogue measurement. Requires httpx and MARKET_TOKEN in the environment."""
import argparse
import concurrent.futures
import json
import math
import os
import time

import httpx


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--url', default='http://127.0.0.1:8083')
    parser.add_argument('--requests', type=int, default=200)
    parser.add_argument('--concurrency', type=int, default=20)
    parser.add_argument('--after', type=int, default=50000)
    args = parser.parse_args()
    token = os.environ.get('MARKET_TOKEN')
    if not token or not 1 <= args.requests <= 10000 or not 1 <= args.concurrency <= 100:
        parser.error('Set MARKET_TOKEN; requests must be 1..10000 and concurrency 1..100')
    with httpx.Client(base_url=args.url, timeout=15,
                      headers={'Authorization': f'Bearer {token}'}) as client:
        for _ in range(5):
            client.get('/api/products', params={'after': args.after, 'limit': 24}).raise_for_status()

        def request(index):
            start = time.perf_counter()
            try:
                response = client.get('/api/products', params={
                    'after': args.after + (index % 20) * 100, 'limit': 24})
                status = response.status_code
                size = len(response.json().get('items', []))
            except (httpx.HTTPError, ValueError, AttributeError):
                status, size = 0, 0
            return (time.perf_counter() - start) * 1000, status, size

        with concurrent.futures.ThreadPoolExecutor(max_workers=args.concurrency) as pool:
            rows = list(pool.map(request, range(args.requests)))
    times = sorted(row[0] for row in rows)
    result = {
        'requests': args.requests, 'concurrency': args.concurrency,
        'p50_ms': round(times[math.ceil(len(times) * .50) - 1], 2),
        'p95_ms': round(times[math.ceil(len(times) * .95) - 1], 2),
        'max_ms': round(times[-1], 2),
        'http_errors': sum(row[1] != 200 for row in rows),
        'wrong_page_sizes': sum(row[2] != 24 for row in rows),
    }
    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    main()
