function Selection({ title, type, options, value, onChange }) {
    return (
        <div>
            <h3>{title}</h3>
            {options.map((option) => {
                const isChecked = type === "checkbox" ? value?.includes?.(option) : option === value;
                return (
                    <label key={option}>
                        <input
                            type={type}
                            name={type === "radio" ? "typeCover" : option}
                            value={option}
                            onChange={onChange}
                            checked={isChecked}
                        />
                        {option}
                    </label>
                );
            })}
        </div>
    );
}

export default Selection;
