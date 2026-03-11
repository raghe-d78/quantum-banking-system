class Money:

    def __init__(self, amount: float, currency: str):
        self.amount = amount
        self.currency = currency

    def add(self, other):
        if self.currency != other.currency:
            raise ValueError("Currencies must match")

        return Money(self.amount + other.amount, self.currency)