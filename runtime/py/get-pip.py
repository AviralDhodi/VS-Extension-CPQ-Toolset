#!/usr/bin/env python
"""
Bootstrap script to download and install pip for embedded Python
"""
import os
import urllib.request
import subprocess
import sys

def download_get_pip():
    """Download get-pip.py from official source"""
    url = "https://bootstrap.pypa.io/get-pip.py"
    print(f"Downloading get-pip.py from {url}...")
    
    try:
        with urllib.request.urlopen(url) as response:
            data = response.read()
        
        with open("get-pip-download.py", "wb") as f:
            f.write(data)
        
        print("Downloaded successfully!")
        return True
    except Exception as e:
        print(f"Error downloading: {e}")
        return False

def install_pip():
    """Install pip using the downloaded script"""
    print("Installing pip...")
    try:
        subprocess.check_call([sys.executable, "get-pip-download.py", "--no-warn-script-location"])
        print("Pip installed successfully!")
        return True
    except subprocess.CalledProcessError as e:
        print(f"Error installing pip: {e}")
        return False

def install_packages():
    """Install required packages"""
    packages = [
        "pandas>=1.5.0",
        "numpy>=1.21.0", 
        "dask>=2023.1.0",
        "pyarrow>=10.0.0",
        "openpyxl>=3.0.0",
        "lxml>=4.9.0"
    ]
    
    print(f"\nInstalling required packages: {', '.join(packages)}")
    
    for package in packages:
        print(f"\nInstalling {package}...")
        try:
            subprocess.check_call([sys.executable, "-m", "pip", "install", package, "--no-warn-script-location"])
            print(f"{package} installed successfully!")
        except subprocess.CalledProcessError as e:
            print(f"Error installing {package}: {e}")
            return False
    
    return True

def main():
    """Main installation process"""
    print("Python Package Installer for CPQ Toolset")
    print("========================================")
    print(f"Python: {sys.executable}")
    print(f"Version: {sys.version}")
    print()
    
    # Check if pip is already installed
    try:
        import pip
        print("Pip is already installed!")
        print(f"Pip version: {pip.__version__}")
    except ImportError:
        print("Pip not found. Installing...")
        if download_get_pip():
            if not install_pip():
                print("\nFailed to install pip!")
                return 1
            # Clean up
            if os.path.exists("get-pip-download.py"):
                os.remove("get-pip-download.py")
        else:
            print("\nFailed to download get-pip.py!")
            return 1
    
    # Install packages
    if install_packages():
        print("\n✓ All packages installed successfully!")
        print("\nYou can verify the installation by running:")
        print(f"  {sys.executable} -m pip list")
        return 0
    else:
        print("\n✗ Some packages failed to install!")
        return 1

if __name__ == "__main__":
    sys.exit(main())