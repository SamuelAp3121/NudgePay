package config

import (
	"database/sql"
	"fmt"
	"log"
	"net/url"
	"os"
	"strings"
	"time"

	_ "github.com/lib/pq"
)

// DB es la conexión compartida a PostgreSQL.
var DB *sql.DB

// sslModes es el orden en que se prueban los modos SSL.
// El primero es el que pide la URL; si falla por SSL se prueba el resto.
var sslModes = []string{"require", "prefer", "disable"}

// modosSeguros son los sslmode que verifican el certificado del servidor.
// Nunca se degradan automáticamente: si el operador los pidió, se respetan.
var modosSeguros = map[string]bool{
	"verify-ca":   true,
	"verify-full": true,
	"allow":       true,
}

// ConnectDB abre la conexión a PostgreSQL de forma tolerante al entorno.
//
// Acepta DATABASE_URL en cualquiera de estas formas:
//
//	postgres://user:pass@host:5432/db            (detecta el SSL solo)
//	postgres://user:pass@host:5432/db?sslmode=disable
//	postgres://user:pass@host:5432/db?sslmode=require
//	postgres://user:pass@host:5432/db?sslmode=verify-full&sslrootcert=cert.pem
//
// Si la URL no especifica sslmode, se intenta require → prefer → disable hasta
// que una funcione. Así el mismo binario sirve para Supabase (SSL obligatorio)
// y para un PostgreSQL local de pruebas (sin SSL).
//
// Si el sslmode viene explícito: se respeta, salvo que sea un modo NO seguro
// (require/prefer/disable) y el servidor no soporte SSL. En ese caso se
// reintenta con disable, para que un .env de producción no bloquee el arranque
// en una máquina de pruebas. Los modos verify-* nunca se degradan.
func ConnectDB() {
	connStr := strings.TrimSpace(os.Getenv("DATABASE_URL"))
	if connStr == "" {
		log.Fatal("Falta DATABASE_URL. Define la cadena de conexión de PostgreSQL en el .env o en las variables de entorno.")
	}

	candidatos := candidatosConexion(connStr)

	var ultimoError error
	for _, candidato := range candidatos {
		db, err := sql.Open("postgres", candidato.dsn)
		if err != nil {
			ultimoError = err
			continue
		}

		db.SetMaxOpenConns(20)
		db.SetMaxIdleConns(5)
		db.SetConnMaxLifetime(30 * time.Minute)
		db.SetConnMaxIdleTime(5 * time.Minute)

		if err := db.Ping(); err != nil {
			ultimoError = err
			_ = db.Close()
			// Credenciales, host o base de datos: cambiar el SSL no ayuda.
			if !esProblemaSSL(err) {
				log.Fatalf("Base de datos inaccesible: %v\n\n%s", err, ayudaConexion(connStr))
			}
			if len(candidatos) > 1 {
				log.Printf("AVISO: sslmode=%s no funcionó en %s (%v). Probando otro modo…", candidato.sslMode, candidato.destino, err)
			}
			continue
		}

		DB = db
		mensaje := fmt.Sprintf("⚡ Conexión exitosa a PostgreSQL: %s", candidato.destino)
		if candidato.sslMode != "" {
			mensaje += " (sslmode=" + candidato.sslMode + ")"
		}
		if candidato.degradado {
			mensaje += " — se degradó el SSL porque el servidor no lo soporta"
		}
		log.Println(mensaje)
		return
	}

	log.Fatalf("Base de datos inaccesible: %v\n\n%s", ultimoError, ayudaConexion(connStr))
}

// candidatoConexion es una cadena de conexión con su modo SSL y su descripción.
type candidatoConexion struct {
	dsn       string
	sslMode   string
	destino   string
	degradado bool
}

// candidatosConexion construye la lista de DSNs a probar.
func candidatosConexion(connStr string) []candidatoConexion {
	destino := describirDestino(connStr)
	explicito := extraerSSLModes(connStr)

	// Sin sslmode en la URL: se prueban los modos en orden de preferencia.
	if len(explicito) == 0 {
		candidatos := make([]candidatoConexion, 0, len(sslModes))
		for _, modo := range sslModes {
			candidatos = append(candidatos, candidatoConexion{
				dsn:     conSSLMODE(connStr, modo),
				sslMode: modo,
				destino: destino,
			})
		}
		return candidatos
	}

	explicitoStr := strings.Join(explicito, ",")
	candidatos := []candidatoConexion{{dsn: connStr, sslMode: explicitoStr, destino: destino}}

	// Modos que verifican certificado: se respetan sin excepción.
	for _, modo := range explicito {
		if modosSeguros[strings.ToLower(strings.TrimSpace(modo))] {
			return candidatos
		}
	}

	// Modo no seguro: se permite un único reintento sin SSL si el servidor
	// resultó no soportarlo (caso típico: .env de producción en una máquina local).
	for _, modo := range []string{"prefer", "disable"} {
		if strings.EqualFold(modo, explicitoStr) {
			continue
		}
		candidatos = append(candidatos, candidatoConexion{
			dsn:       conSSLMODE(sinParametro(connStr, "sslmode"), modo),
			sslMode:   modo,
			destino:   destino,
			degradado: true,
		})
	}
	return candidatos
}

// conSSLMODE devuelve el DSN con el sslmode indicado (añadiendo ? o & según haga falta).
func conSSLMODE(connStr, modo string) string {
	separador := "?"
	if strings.Contains(connStr, "?") {
		separador = "&"
	}
	return connStr + separador + "sslmode=" + modo
}

// sinParametro elimina un parámetro de query de la URL de conexión.
func sinParametro(connStr, clave string) string {
	u, err := url.Parse(connStr)
	if err != nil || u.RawQuery == "" {
		return connStr
	}
	valores := u.Query()
	valores.Del(clave)
	u.RawQuery = valores.Encode()
	return u.String()
}

// extraerSSLModes devuelve el valor de sslmode si la URL lo indica.
func extraerSSLModes(connStr string) []string {
	if valores := extraerParametrosURL(connStr)["sslmode"]; len(valores) > 0 {
		return valores
	}
	// Formato clave=valor (host=... user=... sslmode=disable)
	for _, campo := range strings.Fields(connStr) {
		if clave, valor, ok := strings.Cut(campo, "="); ok && clave == "sslmode" {
			return []string{valor}
		}
	}
	return nil
}

// extraerParametrosURL lee los parámetros de query de una URL de conexión.
func extraerParametrosURL(connStr string) url.Values {
	if !strings.HasPrefix(connStr, "postgres://") && !strings.HasPrefix(connStr, "postgresql://") {
		return url.Values{}
	}
	u, err := url.Parse(connStr)
	if err != nil {
		return url.Values{}
	}
	return u.Query()
}

// describirDestino devuelve "host:puerto/base" sin exponer las credenciales.
func describirDestino(connStr string) string {
	if u, err := url.Parse(connStr); err == nil && u.Host != "" {
		base := strings.TrimPrefix(u.Path, "/")
		if base == "" {
			base = "(sin base)"
		}
		host := u.Host
		if u.Port() == "" {
			host = u.Host + ":5432"
		}
		return fmt.Sprintf("%s/%s", host, base)
	}
	return "postgres"
}

// esProblemaSSL indica si el error se debe a la negociación SSL (y no a
// credenciales, host o base de datos inexistente).
func esProblemaSSL(err error) bool {
	if err == nil {
		return false
	}
	texto := strings.ToLower(err.Error())
	pistas := []string{
		"ssl is not enabled",
		"ssl connection",
		"server does not support ssl",
		"does not support ssl",
		"pq: ssl",
		"tls:",
		"x509:",
	}
	for _, pista := range pistas {
		if strings.Contains(texto, pista) {
			return true
		}
	}
	return false
}

// ayudaConexion devuelve una pista accionable según el tipo de fallo.
func ayudaConexion(connStr string) string {
	modo := strings.Join(extraerSSLModes(connStr), ",")
	if !strings.HasPrefix(connStr, "postgres://") && !strings.HasPrefix(connStr, "postgresql://") {
		return "Pistas:\n" +
			"  • Formato admitido: postgres://usuario:clave@host:5432/base?sslmode=require\n" +
			"  • Revisa que el servidor esté encendido y que el usuario tenga permisos."
	}
	if modo != "" {
		return "Pistas:\n" +
			"  • Supabase en la nube exige SSL: usa ?sslmode=require\n" +
			"  • PostgreSQL local sin SSL: usa ?sslmode=disable\n" +
			"  • Tu URL trae sslmode=" + modo + "; confirma que corresponde a este servidor."
	}
	return "Pistas:\n" +
		"  • Supabase en la nube: añade ?sslmode=require a DATABASE_URL.\n" +
		"  • PostgreSQL local: añade ?sslmode=disable a DATABASE_URL."
}

// DBDisponible informa si la conexión responde (para /health y el panel admin).
func DBDisponible() bool {
	return DB != nil && DB.Ping() == nil
}
