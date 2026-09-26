"""Independent test-only HNP lattice solver for known zero MSBs of ECDSA nonces.

Reads JSON {order, bits, signatures: [{r, s, h}]} on stdin and prints a
candidate scalar. This builds its own embedding from s*k = h + r*d (mod q)
and runs decimal Gram-Schmidt LLL. It does not import the app's HNP builder,
LLL, Babai, or candidate extractor. A candidate is checked by the TypeScript
test against the signer's secret and the public key.
"""

import json
import sys
from decimal import Decimal, localcontext


def gram_schmidt(rows, order):
    vectors = [[Decimal(x) if j != len(row) - 2 else Decimal(x) / order
                for j, x in enumerate(row)] for row in rows]
    orthogonal = []
    mu = [[Decimal(0)] * len(rows) for _ in rows]
    norms = []
    for i, row in enumerate(vectors):
        v = row.copy()
        for j, previous in enumerate(orthogonal):
            mu[i][j] = sum(a * b for a, b in zip(row, previous)) / norms[j]
            v = [a - mu[i][j] * b for a, b in zip(v, previous)]
        orthogonal.append(v)
        norms.append(sum(a * a for a in v))
    return mu, norms


def reduce_basis(rows, order):
    k = 1
    iterations = 0
    while k < len(rows):
        iterations += 1
        if iterations > 30000:
            raise RuntimeError('independent LLL iteration limit')
        mu, norms = gram_schmidt(rows, order)
        for j in range(k - 1, -1, -1):
            coefficient = int(mu[k][j].to_integral_value(rounding='ROUND_HALF_EVEN'))
            if coefficient:
                rows[k] = [a - coefficient * b for a, b in zip(rows[k], rows[j])]
                mu, norms = gram_schmidt(rows, order)
        if norms[k] >= (Decimal('0.75') - mu[k][k-1] ** 2) * norms[k-1]:
            k += 1
        else:
            rows[k], rows[k-1] = rows[k-1], rows[k]
            k = max(1, k-1)
    return rows


def solve(payload):
    q = int(payload['order'])
    unknown = int(payload['bits'])
    bound = 1 << (unknown - 1)
    signatures = payload['signatures']
    count = len(signatures)
    coefficients = []
    offsets = []
    for sig in signatures:
        inverse_s = pow(int(sig['s']), -1, q)
        coefficients.append(int(sig['r']) * inverse_s % q)
        offsets.append((int(sig['h']) * inverse_s - bound) % q)
    rows = [[q if j == i else 0 for j in range(count)] + [0, 0]
            for i in range(count)]
    rows.append(coefficients + [bound, 0])
    rows.append(offsets + [0, q * bound])

    with localcontext() as context:
        context.prec = 190
        reduced = reduce_basis(rows, q)
    for row in reduced:
        if abs(row[-1]) == q * bound and row[-2] % bound == 0:
            for sign in (1, -1):
                candidate = sign * row[-2] // bound % q
                # The known MSB constraint independently rejects spurious rows.
                if all(0 < (int(s['h']) + int(s['r']) * candidate)
                       * pow(int(s['s']), -1, q) % q < 2 ** unknown
                       for s in signatures):
                    return candidate
    raise RuntimeError('independent solver found no constrained candidate')


if __name__ == '__main__':
    print(solve(json.load(sys.stdin)))
