import psycopg2
import os

DB_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@db:5432/easyfinder")

def get_connection():
    return psycopg2.connect(DB_URL)
