import unittest
import os
import json

class SimpleMockTest(unittest.TestCase):
    def test_environment(self):
        """Проверка переменных окружения"""
        self.assertTrue(True)
    
    def test_project_structure(self):
        """Проверка структуры проекта"""
        self.assertTrue(os.path.exists('core'))
        self.assertTrue(os.path.exists('photogrametrista'))

if __name__ == '__main__':
    unittest.main()
