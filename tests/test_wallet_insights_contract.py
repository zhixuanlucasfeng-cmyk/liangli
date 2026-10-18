from pathlib import Path
import subprocess
import unittest

ROOT = Path(__file__).resolve().parents[1]


class WalletInsightsTests(unittest.TestCase):
    def test_existing_budget_transactions(self):
        result = subprocess.run(
            ['node', str(ROOT / 'tests/test_allowance_budget.js')],
            cwd=ROOT, capture_output=True, text=True,
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_wallet_insights_behavior(self):
        result = subprocess.run(
            ['node', str(ROOT / 'tests/test_wallet_insights.js')],
            cwd=ROOT, capture_output=True, text=True,
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
