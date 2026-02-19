from app import db
from datetime import datetime

class Transaction(db.Model):
    """Modèle transaction bancaire"""
    __tablename__ = 'transactions'
    
    # Colonnes
    id = db.Column(db.Integer, primary_key=True)
    transaction_id = db.Column(db.String(100), unique=True, nullable=False, index=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True)
    
    # Détails de la transaction
    transaction_type = db.Column(db.String(20), nullable=False)
    amount = db.Column(db.Numeric(15, 2), nullable=False)
    currency = db.Column(db.String(3), default='USD')
    merchant = db.Column(db.String(200))
    category = db.Column(db.String(50))
    description = db.Column(db.Text)
    
    # Statut et fraude
    status = db.Column(db.String(20), default='pending', index=True)
    is_fraud = db.Column(db.Boolean, default=False, index=True)
    risk_level = db.Column(db.String(20), index=True)
    
    # Scores ML
    classical_prediction = db.Column(db.Integer)
    classical_confidence = db.Column(db.Numeric(5, 4))
    quantum_prediction = db.Column(db.Integer)
    quantum_confidence = db.Column(db.Numeric(5, 4))
    
    # Métadonnées
    ip_address = db.Column(db.String(45))
    device_id = db.Column(db.String(100))
    
    # Timestamps
    timestamp = db.Column(db.DateTime, nullable=False, index=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relations
    quantum_results = db.relationship('QuantumResult', backref='transaction', lazy='dynamic', cascade='all, delete-orphan')
    
    # Contraintes
    __table_args__ = (
        db.CheckConstraint("transaction_type IN ('deposit', 'withdrawal', 'transfer', 'payment', 'purchase')", 
                          name='check_transaction_type'),
        db.CheckConstraint("status IN ('pending', 'completed', 'failed', 'cancelled')", 
                          name='check_transaction_status'),
        db.CheckConstraint("risk_level IN ('low', 'medium', 'high', 'critical')", 
                          name='check_risk_level'),
        db.CheckConstraint('amount > 0', name='check_positive_amount'),
    )
    
    def __repr__(self):
        return f'<Transaction {self.transaction_id}>'