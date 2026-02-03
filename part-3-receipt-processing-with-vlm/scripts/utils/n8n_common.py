#!/usr/bin/env python3
"""
Shared utilities for n8n automation scripts.

This module provides common functionality used by setup-n8n.py and cleanup-n8n.py:
- Environment file loading and validation
- API client with error handling
- Console output helpers
- User interaction utilities
"""

import json
import os
import re
import sys
import urllib.request
import urllib.error
from pathlib import Path
from typing import Any, Dict, Optional

# =============================================================================
# CONFIGURATION
# =============================================================================

N8N_BASE_URL = os.getenv('N8N_BASE_URL', 'http://localhost:5678/api/v1')
PROJECT_ROOT = Path(__file__).parent.parent.parent
ENV_FILE_PATH = PROJECT_ROOT / '.env'
WORKFLOWS_DIR = PROJECT_ROOT / 'n8n' / 'workflows'

# =============================================================================
# EXCEPTIONS
# =============================================================================


class N8NAPIError(Exception):
    """Custom exception for n8n API errors."""

    def __init__(self, message: str, status_code: Optional[int] = None):
        self.message = message
        self.status_code = status_code
        super().__init__(self.message)


class ConfigurationError(Exception):
    """Raised when configuration is invalid or missing."""
    pass


# =============================================================================
# OUTPUT HELPERS
# =============================================================================


def print_header(title: str) -> None:
    """Print a formatted header."""
    print('=' * 60)
    print(title)
    print('=' * 60)


def print_success(message: str) -> None:
    """Print a success message with checkmark."""
    print(f'   ✓ {message}')


def print_error(message: str) -> None:
    """Print an error message with X mark."""
    print(f'   ✗ {message}')


def print_warning(message: str) -> None:
    """Print a warning message with warning sign."""
    print(f'   ⚠️  {message}')


# =============================================================================
# USER INTERACTION
# =============================================================================


def confirm_action(prompt: str, default: bool = False) -> bool:
    """
    Ask user for confirmation.

    Args:
        prompt: The question to ask
        default: Default answer if user just presses Enter

    Returns:
        True if user confirmed, False otherwise
    """
    if default:
        hint = '[Y/n]'
    else:
        hint = '[y/N]'

    try:
        response = input(f'{prompt} {hint}: ').strip().lower()
    except EOFError:
        # Non-interactive mode, use default
        return default

    if not response:
        return default

    return response in ('y', 'yes')


# =============================================================================
# ENVIRONMENT LOADING
# =============================================================================


def load_env_file(env_path: Optional[Path] = None) -> Dict[str, str]:
    """
    Load environment variables from .env file.

    Handles:
    - Quoted values: VAR="value" or VAR='value'
    - Inline comments: VAR=value # comment
    - Empty lines and comment-only lines

    Args:
        env_path: Path to .env file (defaults to ENV_FILE_PATH)

    Returns:
        Dictionary of environment variables

    Raises:
        FileNotFoundError: If .env file doesn't exist
    """
    path = env_path or ENV_FILE_PATH

    if not path.exists():
        raise FileNotFoundError(
            f'❌ .env file not found at {path}\n'
            f'Copy .env.example to .env and update the values.'
        )

    env_vars: Dict[str, str] = {}

    with open(path, 'r') as f:
        for line_num, line in enumerate(f, 1):
            line = line.strip()

            # Skip empty lines and comments
            if not line or line.startswith('#'):
                continue

            # Must have = sign
            if '=' not in line:
                continue

            key, _, value = line.partition('=')
            key = key.strip()

            if not key:
                continue

            # Remove inline comments (but be careful with # in quoted strings)
            value = value.strip()

            # Handle quoted values
            if value and value[0] in ('"', "'"):
                quote_char = value[0]
                # Find matching closing quote
                end_quote = value.find(quote_char, 1)
                if end_quote != -1:
                    value = value[1:end_quote]
                else:
                    # No closing quote, strip the opening one
                    value = value[1:]
            else:
                # Remove inline comment for unquoted values
                comment_idx = value.find('#')
                if comment_idx != -1:
                    value = value[:comment_idx].strip()

            env_vars[key] = value

    return env_vars


def validate_required_vars(env: Dict[str, str], required: list[str]) -> None:
    """
    Validate that required environment variables are present and non-empty.

    Args:
        env: Dictionary of environment variables
        required: List of required variable names

    Raises:
        ValueError: If any required variables are missing or empty
    """
    missing = [key for key in required if not env.get(key)]

    if missing:
        error_msg = '❌ Missing or empty environment variables:\n'
        for var in missing:
            error_msg += f'   - {var}\n'

        if 'N8N_API_KEY' in missing:
            error_msg += '\nTo set N8N_API_KEY: Go to Settings → n8n API in n8n UI'

        raise ValueError(error_msg)


# =============================================================================
# API CLIENT
# =============================================================================


def api_request(
    method: str,
    endpoint: str,
    api_key: str,
    data: Optional[Dict[str, Any]] = None,
    timeout: int = 30,
) -> Optional[Dict[str, Any]]:
    """
    Make an HTTP request to the n8n API.

    Args:
        method: HTTP method (GET, POST, DELETE, etc.)
        endpoint: API endpoint (e.g., '/workflows')
        api_key: n8n API key
        data: Request body data (will be JSON encoded)
        timeout: Request timeout in seconds

    Returns:
        Response data as dictionary, or None for 204/404 responses

    Raises:
        N8NAPIError: If the API request fails
    """
    url = f'{N8N_BASE_URL}{endpoint}'

    headers = {
        'X-N8N-API-KEY': api_key,
        'Content-Type': 'application/json',
    }

    request_data = json.dumps(data).encode('utf-8') if data else None

    try:
        req = urllib.request.Request(
            url,
            data=request_data,
            headers=headers,
            method=method
        )

        with urllib.request.urlopen(req, timeout=timeout) as response:
            # Handle 204 No Content
            if response.status == 204:
                return None

            response_body = response.read().decode('utf-8')
            if not response_body:
                return None

            return json.loads(response_body)

    except urllib.error.HTTPError as e:
        # Handle 404 Not Found gracefully
        if e.code == 404:
            return None

        error_body = e.read().decode('utf-8')
        try:
            error_data = json.loads(error_body)
            error_msg = error_data.get('message', error_body)
        except json.JSONDecodeError:
            error_msg = error_body

        raise N8NAPIError(f'{e.code} - {error_msg}', status_code=e.code)

    except urllib.error.URLError as e:
        if 'Connection refused' in str(e.reason):
            raise N8NAPIError(
                f'Cannot connect to n8n at {N8N_BASE_URL}. Is n8n running?\n'
                f'Start with: docker compose up -d'
            )
        raise N8NAPIError(f'Network error: {e.reason}')


def validate_api_connectivity(timeout: int = 5) -> None:
    """
    Validate that n8n API is accessible.

    Args:
        timeout: Request timeout in seconds

    Raises:
        ConnectionError: If n8n is not accessible
    """
    try:
        req = urllib.request.Request(f'{N8N_BASE_URL}/credentials/schema/postgres')
        urllib.request.urlopen(req, timeout=timeout)
    except urllib.error.HTTPError as e:
        # 401 means API is accessible but auth failed (which is fine here)
        if e.code == 401:
            return
        raise
    except urllib.error.URLError:
        raise ConnectionError(
            f'❌ Cannot connect to n8n at {N8N_BASE_URL}\n'
            f'Ensure n8n is running: docker compose up -d'
        )


def validate_api_key(api_key: str) -> None:
    """
    Validate that the API key is valid.

    Args:
        api_key: n8n API key to validate

    Raises:
        N8NAPIError: If the API key is invalid
    """
    try:
        api_request('GET', '/credentials/schema/postgres', api_key, timeout=10)
    except N8NAPIError as e:
        if e.status_code == 401 or 'Unauthorized' in str(e):
            raise N8NAPIError(
                '❌ Invalid N8N_API_KEY\n'
                'Go to Settings → n8n API in n8n UI to create a valid API key'
            )
        raise
