package config

import (
	"database/sql"
	"log"
	"os"

	_ "github.com/lib/pq"
)

var DB *sql.DB

func ConnectDB() {
	var err error
	connStr := os.Getenv("DATABASE_URL")
	DB, err = sql.Open("postgres", connStr)
	if err != nil {
		log.Fatal("Error conectando a la base de datos: ", err)
	}

	if err = DB.Ping(); err != nil {
		log.Fatal("Base de datos inaccesible: ", err)
	}

	log.Println("⚡ Conexión exitosa a Supabase PostgreSQL")
}
