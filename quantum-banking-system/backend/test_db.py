from app import create_app, db
from app.models import User, Transaction, AuditLog, QuantumResult
from datetime import datetime
import uuid

app = create_app('development')

with app.app_context():
    # Créer un utilisateur
    user = User(
        username='testuser',
        email='test@example.com',
        first_name='John',
        last_name='Doe',
        role='user'
    )
    user.set_password('password123')
    db.session.add(user)
    db.session.commit()
    print(f"✅ Utilisateur créé: {user.username}")
    
    # Créer une transaction
    transaction = Transaction(
        transaction_id=f"TXN-{uuid.uuid4().hex[:8]}",
        user_id=user.id,
        transaction_type='purchase',
        amount=150.75,
        merchant='Amazon',
        category='shopping',
        timestamp=datetime.utcnow(),
        status='completed'
    )
    db.session.add(transaction)
    db.session.commit()
    print(f"✅ Transaction créée: {transaction.transaction_id}")
    
    # Créer un log
    log = AuditLog(
        user_id=user.id,
        action='user_login',
        level='INFO',
        message='User logged in successfully'
    )
    db.session.add(log)
    db.session.commit()
    print(f"✅ Log créé: {log.action}")
    
    # Créer un résultat quantique
    quantum = QuantumResult(
        transaction_id=transaction.id,
        job_id=f"QJB-{uuid.uuid4().hex[:8]}",
        algorithm='VQC',
        num_qubits=4,
        circuit_depth=3,
        execution_time=12.5,
        prediction=0,
        confidence=0.87,
        status='completed'
    )
    db.session.add(quantum)
    db.session.commit()
    print(f"✅ Résultat quantique créé: {quantum.job_id}")
    
    print("\n🎉 Tous les tests réussis!")