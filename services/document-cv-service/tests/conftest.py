import os, sys
HERE = os.path.dirname(__file__)
sys.path.insert(0, os.path.abspath(os.path.join(HERE, "..")))
os.environ.setdefault("DOCUMENT_KAFKA_ENABLED", "false")
os.environ.setdefault("DOCUMENT_STORE_DIR", os.path.join(HERE, ".store"))
