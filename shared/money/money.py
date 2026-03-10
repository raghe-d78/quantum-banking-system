class Money:

    def __init__(self, amount: int, currency: str):
        if amount < 0:
            raise ValueError("Amount cannot be negative")

        self.amount = amount
        self.currency = currency

    def add(self, other):
        if self.currency != other.currency:
            raise ValueError("Currency mismatch")

        return Money(self.amount + other.amount, self.currency)

    def subtract(self, other):
        if self.currency != other.currency:
            raise ValueError("Currency mismatch")

        if other.amount > self.amount:
            raise ValueError("Insufficient funds")

        return Money(self.amount - other.amount, self.currency)

    def __repr__(self):
        return f"{self.amount} {self.currency}"