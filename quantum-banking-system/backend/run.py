from app import create_app, db

app = create_app('development')

@app.cli.command()
def init_db():
    """Initialiser la base de données"""
    db.create_all()
    print("✅ Base de données initialisée!")

@app.cli.command()
def drop_db():
    """Supprimer toutes les tables"""
    db.drop_all()
    print("❌ Toutes les tables supprimées!")

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)