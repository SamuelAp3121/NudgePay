// Comando para promover una cuenta existente a administrador.
//
// Uso (desde la carpeta del backend, con el .env cargado):
//
//	go run ./cmd/crear_admin tu@email.com
//
// Si la cuenta no existe, la crea con la contraseña indicada en -password.
package main

import (
	"database/sql"
	"flag"
	"fmt"
	"log"
	"os"
	"strings"

	"invoice-reminder/config"
	"invoice-reminder/handlers"

	"github.com/joho/godotenv"
)

func main() {
	password := flag.String("password", "", "Contraseña para crear la cuenta si no existe")
	flag.Parse()

	email := strings.ToLower(strings.TrimSpace(flag.Arg(0)))
	if email == "" {
		fmt.Println("Uso: go run ./cmd/crear_admin <email> [-password <contraseña>]")
		os.Exit(1)
	}

	_ = godotenv.Load()
	config.ConnectDB()

	var id string
	err := config.DB.QueryRow(`SELECT id FROM usuarios WHERE lower(email) = $1`, email).Scan(&id)
	switch {
	case err == sql.ErrNoRows:
		if *password == "" {
			log.Fatalf("La cuenta %s no existe. Añade -password para crearla.", email)
		}
		hash, err := handlers.HashearPassword(*password)
		if err != nil {
			log.Fatal("No se pudo procesar la contraseña: ", err)
		}
		apiKey, err := handlers.GenerarAPIKey()
		if err != nil {
			log.Fatal("No se pudo generar la API Key: ", err)
		}
		err = config.DB.QueryRow(
			`INSERT INTO usuarios (email, api_key, password_hash, plan, rol)
			 VALUES ($1, $2, $3, 'pro', 'admin') RETURNING id`,
			email, apiKey, hash,
		).Scan(&id)
		if err != nil {
			log.Fatal("No se pudo crear el administrador: ", err)
		}
		fmt.Printf("✅ Administrador creado: %s (id %s)\n", email, id)
		return
	case err != nil:
		log.Fatal("Error consultando el usuario: ", err)
	}

	if _, err := config.DB.Exec(
		`UPDATE usuarios SET rol = 'admin', suspendido = FALSE, suspendido_motivo = NULL WHERE id = $1`, id,
	); err != nil {
		log.Fatal("No se pudo promover la cuenta: ", err)
	}
	fmt.Printf("✅ La cuenta %s ahora es administrador (id %s)\n", email, id)
}
